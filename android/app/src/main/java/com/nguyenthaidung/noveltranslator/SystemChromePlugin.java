package com.nguyenthaidung.noveltranslator;

import android.graphics.Color;
import android.os.Build;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Đồng màu status bar + thanh gesture đáy (không overlay WebView). */
@CapacitorPlugin(name = "SystemChrome")
public class SystemChromePlugin extends Plugin {

    @SuppressWarnings("deprecation")
    @PluginMethod
    public void setSystemBars(PluginCall call) {
        String colorHex = call.getString("color");
        if (colorHex == null || colorHex.isEmpty()) {
            call.reject("color required");
            return;
        }
        final boolean lightBarIcons = Boolean.TRUE.equals(call.getBoolean("lightBarIcons", false));

        getActivity().runOnUiThread(() -> {
            try {
                String normalized = colorHex.startsWith("#") ? colorHex : "#" + colorHex;
                int color = Color.parseColor(normalized);
                android.view.Window window = getActivity().getWindow();
                window.setStatusBarColor(color);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    window.setNavigationBarColor(color);
                }
                WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(window, window.getDecorView());
                if (controller != null) {
                    controller.setAppearanceLightStatusBars(lightBarIcons);
                    controller.setAppearanceLightNavigationBars(lightBarIcons);
                }
                call.resolve();
            } catch (IllegalArgumentException e) {
                call.reject("Invalid color: " + colorHex, e);
            }
        });
    }
}
