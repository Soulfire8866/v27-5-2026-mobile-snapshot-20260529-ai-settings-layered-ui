package com.nguyenthaidung.noveltranslator;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(name = "NativeFileSave")
public class NativeFileSavePlugin extends Plugin {
    private final Map<String, OutputStream> streamSessions = new HashMap<>();

    @PluginMethod
    public void startSave(PluginCall call) {
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "application/octet-stream");

        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("fileName required");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );

        startActivityForResult(call, intent, "handleCreateDocumentResult");
    }

    @ActivityCallback
    private void handleCreateDocumentResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result == null || result.getResultCode() != Activity.RESULT_OK) {
            call.resolve(new JSObject().put("cancelled", true));
            return;
        }

        Intent data = result.getData();
        if (data == null || data.getData() == null) {
            call.reject("No file URI returned from picker");
            return;
        }

        Uri uri = data.getData();

        try {
            final int takeFlags = data.getFlags()
                & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (takeFlags != 0) {
                getContext().getContentResolver().takePersistableUriPermission(uri, takeFlags);
            }
            OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w");
            if (output == null) {
                call.reject("Cannot open output stream");
                return;
            }
            String sessionId = UUID.randomUUID().toString();
            streamSessions.put(sessionId, output);

            JSObject resp = new JSObject();
            resp.put("cancelled", false);
            resp.put("sessionId", sessionId);
            resp.put("uri", uri.toString());
            resp.put("fileName", call.getString("fileName", ""));
            call.resolve(resp);
        } catch (Exception ex) {
            call.reject("Failed to save file: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void writeChunk(PluginCall call) {
        String sessionId = call.getString("sessionId");
        String rawBase64 = call.getString("base64Data");
        if (sessionId == null || sessionId.trim().isEmpty()) {
            call.reject("sessionId required");
            return;
        }
        if (rawBase64 == null || rawBase64.trim().isEmpty()) {
            call.reject("base64Data required");
            return;
        }

        OutputStream output = streamSessions.get(sessionId);
        if (output == null) {
            call.reject("Invalid sessionId");
            return;
        }

        try {
            String normalized = rawBase64;
            int comma = normalized.indexOf(',');
            if (comma >= 0) {
                normalized = normalized.substring(comma + 1);
            }
            byte[] bytes = Base64.decode(normalized, Base64.DEFAULT);
            output.write(bytes);
            JSObject resp = new JSObject();
            resp.put("written", bytes.length);
            call.resolve(resp);
        } catch (Exception ex) {
            call.reject("Failed writing chunk: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void finishSave(PluginCall call) {
        String sessionId = call.getString("sessionId");
        if (sessionId == null || sessionId.trim().isEmpty()) {
            call.reject("sessionId required");
            return;
        }

        OutputStream output = streamSessions.remove(sessionId);
        if (output == null) {
            call.reject("Invalid sessionId");
            return;
        }
        try {
            output.flush();
            output.close();
            JSObject resp = new JSObject();
            resp.put("ok", true);
            call.resolve(resp);
        } catch (Exception ex) {
            call.reject("Failed finishing save: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void cancelSave(PluginCall call) {
        String sessionId = call.getString("sessionId");
        if (sessionId == null || sessionId.trim().isEmpty()) {
            call.resolve();
            return;
        }
        OutputStream output = streamSessions.remove(sessionId);
        if (output != null) {
            try {
                output.close();
            } catch (Exception ignored) {
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String rawUri = call.getString("uri");
        if (rawUri == null || rawUri.trim().isEmpty()) {
            call.reject("uri required");
            return;
        }
        try {
            Uri uri = Uri.parse(rawUri);
            boolean deleted = false;
            try {
                deleted = DocumentsContract.deleteDocument(getContext().getContentResolver(), uri);
            } catch (Exception ignored) {
                // fallback below
            }
            if (!deleted) {
                int rows = getContext().getContentResolver().delete(uri, null, null);
                deleted = rows > 0;
            }
            if (!deleted) {
                call.reject("Cannot delete target file");
                return;
            }
            JSObject resp = new JSObject();
            resp.put("ok", true);
            call.resolve(resp);
        } catch (Exception ex) {
            call.reject("Failed deleting file: " + ex.getMessage(), ex);
        }
    }
}
