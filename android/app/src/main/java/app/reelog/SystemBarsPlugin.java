package app.reelog;

import android.graphics.Color;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Colours the status and navigation bars (and the window behind them) to match the app's theme. */
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {
    @PluginMethod
    @SuppressWarnings("deprecation")
    public void set(PluginCall call) {
        int color;
        try {
            color = Color.parseColor(call.getString("color", "#0C0A0A"));
        } catch (IllegalArgumentException e) {
            call.reject("Bad color");
            return;
        }
        boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        getActivity().runOnUiThread(() -> {
            Window w = getActivity().getWindow();
            w.getDecorView().setBackgroundColor(color);
            w.setStatusBarColor(color);
            w.setNavigationBarColor(color);
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
            c.setAppearanceLightStatusBars(light);
            c.setAppearanceLightNavigationBars(light);
            call.resolve();
        });
    }
}
