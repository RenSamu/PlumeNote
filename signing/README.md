# Signature de l'APK (facultatif)

Sans clé, GitHub Actions produit un APK « debug », installable tel quel.
Pour un APK « release » signé (mises à jour propres par-dessus l'installation) :

    keytool -genkeypair -v -keystore plume.jks -alias plume -keyalg RSA -keysize 2048 -validity 36500
    base64 -w0 plume.jks   # à coller dans le secret PLUME_KEYSTORE_B64

Secrets à créer dans GitHub (Settings → Secrets and variables → Actions) :
PLUME_KEYSTORE_B64, PLUME_KEYSTORE_PASSWORD, PLUME_KEY_ALIAS, PLUME_KEY_PASSWORD.
Ne commitez jamais plume.jks.
