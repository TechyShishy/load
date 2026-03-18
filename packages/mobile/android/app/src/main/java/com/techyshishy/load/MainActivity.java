package com.techyshishy.load;

import android.os.Bundle;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Lock WebView text zoom to 100%.
        // Android respects the system font-size preference by default, which
        // inflates the WebView's base font from 16px to 20.8px at 130% scale.
        // All rem-based Tailwind sizing then overflows its containers.
        // setTextZoom(100) bypasses system font scale for this WebView only.
        // NOTE: this intentionally overrides the user's system font-scale
        // preference. Acceptable here because the game layout breaks at
        // scales above ~110%; layout-aware font scaling is future work.
        getBridge().getWebView().getSettings().setTextZoom(100);
        // Remove Android WebView's default 8px minimum font size floor.
        // FitTextBlock shrinks text to as low as 4px (CSS) to fit content;
        // without this, Android clamps the rendered font at 8px regardless of
        // the CSS value, causing cards with long descriptions (e.g. Work Order)
        // to overflow their allocated space even at JavaScript minFontSize.
        getBridge().getWebView().getSettings().setMinimumFontSize(1);
        getBridge().getWebView().getSettings().setMinimumLogicalFontSize(1);
        enableImmersiveFullscreen();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveFullscreen();
        }
    }

    private void enableImmersiveFullscreen() {
        Window window = getWindow();
        View decorView = window.getDecorView();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, decorView);
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }
}
