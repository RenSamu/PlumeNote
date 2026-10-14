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

## Agenda et calendrier du téléphone (APK)
- La note du jour affiche un bloc **Agenda** : rendez-vous du jour, tâches en retard ou du jour (des autres notes), aperçu des 7 prochains jours. Il se replie d'un appui.
- Premier affichage : Plume demande l'accès au calendrier. Sans accès, seules les tâches sont affichées. Plume ne modifie jamais un événement existant.
- Une tâche avec date **et heure** (`- [ ] RDV dentiste demain 14h`) est reconnue à la fin de la ligne : Plume propose « Ajouter au calendrier ». L'événement dure 1 h ; la ligne reçoit un 📅 pour ne pas être proposée deux fois.
- Dates en clair reconnues sur une ligne de tâche, à condition d'avoir une heure : `demain 14h`, `mardi 9h30`, `le 20/12 à 14:00`, `15/10 18:00`.
- Sur le web, il n'y a pas de calendrier local : le bloc montre les tâches et indique que les rendez-vous sont disponibles dans l'application Android.
- Permissions ajoutées par `scripts/prepare-android.mjs` : `READ_CALENDAR`, `WRITE_CALENDAR`. Plugin : `@ebarooni/capacitor-calendar`.

## Synchronisation (Supabase)
1. Exécuter `supabase/schema.sql` dans le SQL Editor (réexécutable sans risque).
2. Authentication → Emails : le modèle « Magic Link » doit contenir `{{ .Token }}`.
3. Réglages de Plume → Synchronisation → recevoir le code par e-mail.
Les clés publiques du projet sont dans `src/config.js`.
