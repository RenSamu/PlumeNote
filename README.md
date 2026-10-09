# Plume

Notes rapides, locales d'abord. Markdown en direct, tâches et rappels, journal, pièces jointes.

## Obtenir l'APK (sans rien installer sur votre PC)
1. Créez un dépôt GitHub (privé ou public) et poussez ce dossier :
       git init && git add . && git commit -m "Plume" && git branch -M main
       git remote add origin https://github.com/<vous>/plume.git && git push -u origin main
2. Onglet **Actions** → « Construire l'APK Android » → **Run workflow**.
3. Après ~6 min, ouvrez l'exécution → **Artifacts** → `plume-apk` → décompressez → `app-debug.apk`.
4. Sur le téléphone : ouvrez le .apk, autorisez « installer des applications inconnues » pour le navigateur/gestionnaire de fichiers, installez.

## Version web (PWA)
Activez Settings → Pages → Source : GitHub Actions. Le workflow « Publier la version web » met Plume en ligne ;
sur le téléphone : menu du navigateur → « Installer l'application ».

## Développement
    npm install
    npm run dev       # compile en continu
    npm run serve     # serveur local
    node build.mjs --single   # dist/plume-web.html, un seul fichier

## Raccourcis
Alt+N nouvelle note · Alt+J aujourd'hui · Alt+T tâches · Ctrl/Cmd+K palette.
Dates dans une tâche : `@demain 14h`, `@lun`, `@+3j`, `@12/10`.

## Android natif
Widget d'accueil, tuile « Nouvelle note » dans les réglages rapides, raccourcis d'icône (appui long),
partage de texte vers Plume. Liens : `plume://new`, `plume://today`, `plume://tasks`.

## Suite prévue
Synchronisation Supabase (`supabase/schema.sql`), connexion par lien magique.
