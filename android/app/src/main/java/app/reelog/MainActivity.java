package app.reelog;

import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemBarsPlugin.class);
        super.onCreate(savedInstanceState);
        keepClearOfKeyboard();
    }

    /**
     * Android 15 draws apps edge to edge, and the keyboard then no longer shrinks the window: it
     * covers the bottom of the page, so a notes field in a sheet ends up under it. Capacitor keeps
     * the WebView clear of the system bars (adjustMarginsForEdgeToEdge); this replaces its listener
     * with one that keeps it clear of the keyboard too. On older Android the window is resized
     * for the keyboard as before, and the keyboard inset here stays 0.
     */
    private void keepClearOfKeyboard() {
        if (getBridge() == null) return;
        WebView web = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
            mlp.leftMargin = bars.left;
            mlp.topMargin = bars.top;
            mlp.rightMargin = bars.right;
            mlp.bottomMargin = Math.max(bars.bottom, ime.bottom);
            v.setLayoutParams(mlp);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(web);
    }
}
