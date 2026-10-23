package app.plume.notes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Widget « Agenda » : rendez-vous et tâches du jour, d'après l'instantané déposé par l'application. */
public class AgendaWidget extends AppWidgetProvider {
    static final String PREFS = "plume_widget";
    static final String KEY = "agenda";
    private static final int ROWS = 6;

    private static final int[] ROW = { R.id.a_row0, R.id.a_row1, R.id.a_row2, R.id.a_row3, R.id.a_row4, R.id.a_row5 };
    private static final int[] TIME = { R.id.a_t0, R.id.a_t1, R.id.a_t2, R.id.a_t3, R.id.a_t4, R.id.a_t5 };
    private static final int[] TEXT = { R.id.a_x0, R.id.a_x1, R.id.a_x2, R.id.a_x3, R.id.a_x4, R.id.a_x5 };

    private static final int AMBER = 0xFFF2A33A;
    private static final int GREY = 0xFF8E887E;
    private static final int RED = 0xFFE5736A;

    private static PendingIntent link(Context c, String uri, int code) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        i.setPackage(c.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void refreshAll(Context c) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(c);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(c, AgendaWidget.class));
        if (ids != null && ids.length > 0) render(c, mgr, ids);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager mgr, int[] ids) {
        render(c, mgr, ids);
    }

    private static void render(Context c, AppWidgetManager mgr, int[] ids) {
        Date now = new Date();
        String key = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(now);
        String title = new SimpleDateFormat("EEEE d MMMM", Locale.FRENCH).format(now);
        if (title.length() > 0) title = title.substring(0, 1).toUpperCase(Locale.FRENCH) + title.substring(1);

        JSONArray rows = null;
        int more = 0;
        boolean hasData = false;
        try {
            String raw = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            if (raw != null) {
                JSONObject day = new JSONObject(raw).getJSONObject("days").optJSONObject(key);
                if (day != null) {
                    hasData = true;
                    rows = day.optJSONArray("rows");
                    more = day.optInt("more", 0);
                }
            }
        } catch (Exception ignored) {
        }

        for (int id : ids) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_agenda);
            v.setTextViewText(R.id.a_title, title);
            v.setOnClickPendingIntent(R.id.a_title, link(c, "plume://today", 11));
            v.setOnClickPendingIntent(R.id.a_root, link(c, "plume://today", 11));
            v.setOnClickPendingIntent(R.id.a_dictate, link(c, "plume://dictate?mode=task", 12));
            v.setOnClickPendingIntent(R.id.a_new, link(c, "plume://new", 13));

            int n = rows == null ? 0 : Math.min(rows.length(), ROWS);
            for (int i = 0; i < ROWS; i++) {
                if (i < n) {
                    JSONObject r = rows.optJSONObject(i);
                    String s = r == null ? "" : r.optString("s", "");
                    String t = r == null ? "" : r.optString("t", "");
                    boolean event = r != null && "e".equals(r.optString("k"));
                    boolean late = r != null && r.optBoolean("late", false);
                    if (s.length() == 0) s = event ? "Jour" : "☐";
                    v.setViewVisibility(ROW[i], View.VISIBLE);
                    v.setTextViewText(TIME[i], s);
                    v.setTextColor(TIME[i], event ? AMBER : (late ? RED : GREY));
                    v.setTextViewText(TEXT[i], t);
                } else {
                    v.setViewVisibility(ROW[i], View.GONE);
                }
            }

            int hidden = (rows == null ? 0 : Math.max(0, rows.length() - ROWS)) + more;
            if (hidden > 0) {
                v.setViewVisibility(R.id.a_more, View.VISIBLE);
                v.setTextViewText(R.id.a_more, "+ " + hidden + " autres");
            } else {
                v.setViewVisibility(R.id.a_more, View.GONE);
            }

            if (n == 0) {
                v.setViewVisibility(R.id.a_empty, View.VISIBLE);
                v.setTextViewText(R.id.a_empty, hasData ? "Rien de prévu aujourd’hui." : "Ouvrez Plume pour afficher votre journée.");
            } else {
                v.setViewVisibility(R.id.a_empty, View.GONE);
            }
            mgr.updateAppWidget(id, v);
        }
    }
}
