package app.plume.notes;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

/**
 * Pont natif de Plume :
 *  - setAgenda : reçoit l'instantané JSON pour le widget Agenda ;
 *  - listen / stop / cancel : dictée vocale via la reconnaissance vocale d'Android.
 */
@CapacitorPlugin(
    name = "PlumeNative",
    permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone") }
)
public class PlumeNativePlugin extends Plugin {
    private SpeechRecognizer recognizer;
    private PluginCall listenCall;
    private String lastPartial = "";

    // ——— Widget ———

    @PluginMethod
    public void setAgenda(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json manquant");
            return;
        }
        getContext()
            .getSharedPreferences(AgendaWidget.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(AgendaWidget.KEY, json)
            .apply();
        AgendaWidget.refreshAll(getContext());
        call.resolve();
    }

    // ——— Dictée ———

    @PluginMethod
    public void listen(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "micResult");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void micResult(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            begin(call);
        } else {
            call.reject("Micro refusé", "permission");
        }
    }

    @PluginMethod
    public void stop(final PluginCall call) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (recognizer != null) recognizer.stopListening();
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void cancel(final PluginCall call) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                finish(null, "cancelled");
                call.resolve();
            }
        });
    }

    private void begin(final PluginCall call) {
        final String lang = call.getString("lang", "fr-FR");
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                destroyRecognizer();
                if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
                    call.reject("Reconnaissance vocale indisponible", "unavailable");
                    return;
                }
                listenCall = call;
                lastPartial = "";
                bridge.saveCall(call);
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(new Listener());
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
                recognizer.startListening(intent);
            }
        });
    }

    /** Termine l'appel en cours : texte (succès) ou code d'erreur. À appeler sur le fil principal. */
    private void finish(String text, String errorCode) {
        PluginCall call = listenCall;
        listenCall = null;
        destroyRecognizer();
        if (call == null) return;
        if (errorCode != null) {
            call.reject("Dictée interrompue", errorCode);
        } else {
            JSObject ret = new JSObject();
            ret.put("text", text == null ? "" : text);
            call.resolve(ret);
        }
        bridge.releaseCall(call);
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            try {
                recognizer.cancel();
                recognizer.destroy();
            } catch (Exception ignored) {
            }
            recognizer = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        destroyRecognizer();
    }

    private static String first(Bundle results) {
        if (results == null) return null;
        ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return (list != null && !list.isEmpty()) ? list.get(0) : null;
    }

    private class Listener implements RecognitionListener {
        @Override
        public void onReadyForSpeech(Bundle params) {}

        @Override
        public void onBeginningOfSpeech() {}

        @Override
        public void onRmsChanged(float rmsdB) {}

        @Override
        public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEndOfSpeech() {}

        @Override
        public void onEvent(int eventType, Bundle params) {}

        @Override
        public void onPartialResults(Bundle partialResults) {
            String t = first(partialResults);
            if (t != null && !t.isEmpty()) {
                lastPartial = t;
                JSObject data = new JSObject();
                data.put("text", t);
                notifyListeners("partial", data);
            }
        }

        @Override
        public void onResults(Bundle results) {
            String t = first(results);
            finish(t != null ? t : lastPartial, null);
        }

        @Override
        public void onError(int error) {
            // Silence ou aucune correspondance : on rend le texte partiel s'il existe, sinon une erreur lisible.
            if ((error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) && !lastPartial.isEmpty()) {
                finish(lastPartial, null);
                return;
            }
            String code;
            switch (error) {
                case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                    code = "permission";
                    break;
                case SpeechRecognizer.ERROR_NETWORK:
                case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                    code = "network";
                    break;
                case SpeechRecognizer.ERROR_NO_MATCH:
                case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                    code = "no-speech";
                    break;
                case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                case SpeechRecognizer.ERROR_CLIENT:
                    code = "busy";
                    break;
                default:
                    code = "unavailable";
            }
            finish(null, code);
        }
    }
}
