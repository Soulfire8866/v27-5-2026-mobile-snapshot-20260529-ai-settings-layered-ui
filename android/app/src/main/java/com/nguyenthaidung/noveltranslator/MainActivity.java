package com.nguyenthaidung.noveltranslator;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemChromePlugin.class);
        registerPlugin(NativeFileSavePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
