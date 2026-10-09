package app.plume.notes;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        setIntent(convertShare(getIntent()));
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(convertShare(intent));
    }

    /** Transforme un partage Android (texte) en lien plume://share?text=… lu par l'application web. */
    private Intent convertShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return intent;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return intent;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (text == null && subject == null) return intent;
        String body = (subject != null && !subject.isEmpty() ? subject + "\n\n" : "") + (text != null ? text : "");
        Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse("plume://share?text=" + Uri.encode(body)));
        view.setPackage(getPackageName());
        return view;
    }
}
