package app.plume.notes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/** Widget d'écran d'accueil : nouvelle note, aujourd'hui, tâches. */
public class PlumeWidget extends AppWidgetProvider {
    private static PendingIntent link(Context c, String cmd, int code) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("plume://" + cmd));
        i.setPackage(c.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_plume);
            v.setOnClickPendingIntent(R.id.w_new, link(c, "new", 1));
            v.setOnClickPendingIntent(R.id.w_root, link(c, "new", 1));
            v.setOnClickPendingIntent(R.id.w_today, link(c, "today", 2));
            v.setOnClickPendingIntent(R.id.w_tasks, link(c, "tasks", 3));
            mgr.updateAppWidget(id, v);
        }
    }
}
