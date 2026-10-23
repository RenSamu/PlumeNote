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


## Phase 1 : rappels d'assistant (v0.3.0)

- **Tâches récurrentes** : écrire `chaque vendredi 16h`, `tous les jours 7h`, `chaque mois le 5`, `en semaine 9h`… sur une ligne de tâche. Elle devient `@date heure ↻semaine`. Cocher la tâche ne la ferme pas : elle passe à la prochaine échéance.
- **Point du matin** : une notification à l'heure choisie (Réglages > Rappels, 07:30 par défaut) avec les rendez-vous du téléphone et les tâches du jour. Rien n'est envoyé si la journée est vide. Un appui ouvre le journal du jour. Planifiée pour 7 jours, remise à jour à chaque ouverture de l'application.
- **Boutons dans les rappels** : *Fait*, *Dans 1 h*, *Demain*. Android ouvre brièvement l'application pour appliquer l'action, puis la referme.

## Widget Agenda et dictée vocale (v0.4.0, APK)

- **Widget « Plume Agenda »** (ajout depuis la liste des widgets de l'écran d'accueil) : date du jour, rendez-vous du téléphone et tâches du jour (en retard en rouge), boutons *Dicter* et *+ Note*. L'application dépose un instantané de 7 jours à chaque modification et quand vous la quittez ; le widget se redessine aussi toutes les 30 minutes. Les rendez-vous ajoutés directement dans votre calendrier apparaissent après la prochaine ouverture de Plume.
- **Dictée** : bouton « Dicter du texte » dans la barre d'outils d'une note (le texte est inséré au curseur), micro dans la saisie rapide de Tâches, lien `plume://dictate` (nouvelle note) et `plume://dictate?mode=task` (tâche dans le journal du jour, dates et heures comprises : « appeler Marc demain à 14h »). Raccourci d'icône « Dicter » (appui long). Ponctuation à voix haute : *virgule*, *point final*, *point d'interrogation*, *à la ligne*…
- Code natif : `native/java/PlumeNativePlugin.java` (dictée via SpeechRecognizer d'Android, instantané du widget) et `AgendaWidget.java`, installés par `scripts/prepare-android.mjs`.

## Phase 2 : relier ses notes (v0.5.0)

- **Liens `[[Titre]]`** : taper `[[` propose les notes existantes (ou « nouvelle note »). Un lien existant s'ouvre d'un appui ; un lien vers une note qui n'existe pas (pointillés) la crée. La comparaison ignore casse et accents. Sous chaque note, « Mentionnée dans N notes » liste les notes qui la citent. Attention : si vous renommez une note, les liens écrits avec l'ancien titre ne la retrouvent plus (ils redeviennent « à créer »).
- **Boîte de réception** : tout ce qui est partagé vers Plume (lien, texte) y arrive. Pour un lien seul, le titre de la page est récupéré (APK). **Trier** : garder en note, dans un dossier, en faire une tâche, corbeille, ou plus tard. Ces éléments n'apparaissent pas dans « Notes » tant qu'ils ne sont pas triés. Lien : `plume://inbox`.
- **Personnes** : une note de type personne par contact (`☎` et `✉` pour les coordonnées). Boutons Appeler / Message / Écrire, tâches ouvertes qui citent la personne (`[[Marc Dupont]]`), et mentions. Dans l'APK, « Importer… » lit les contacts du téléphone (autorisation demandée une fois).
- **Revue de la semaine** : en retard (Fait / Demain / Lundi / Sans date), 7 prochains jours (avec le calendrier), tâches sans date, boîte de réception. Rappel le dimanche soir (18:00, réglable). Lien : `plume://review`.
- Aucun changement à la base Supabase : boîte de réception et personnes utilisent le champ `kind` existant.

## Phase 3 — habitudes, modèles, temps passé, collections, écriture

- **Habitudes** (menu « Habitudes ») : saisir « Sport 3/semaine » ou « Méditer » (chaque jour). Une note par habitude, lignes `⟳ 3/semaine`, `⏰ HH:MM` (rappel avec bouton *Fait*), `✓ AAAA-MM-JJ` (jours validés). Semaine en 7 boutons, série (jours ou semaines).
- **Modèles** : Intervention client, Compte rendu, Poème, Fiche de lecture, Fiche de film, Idée de projet ; « Enregistrer comme modèle » depuis le menu ⋯ d'une note. Marqueurs : `{{date}} {{iso}} {{heure}} {{curseur}}`.
- **Temps passé** : écrire `temps: 1h30`, `temps: 45min` ou `temps: 1,5h` (ou avec ⏱, ou `durée:`, `tps:`) dans une note ; le client est le `[[lien]]` de la même ligne, sinon le premier lien de la note. Résumé copiable pour un ticket.
- **Collections** : propriétés `clé:: valeur` (ex. `statut:: lu`, `note:: 5`) ; pastilles dans la liste, filtre par statut dans les vues d'étiquette.
- **Mode écriture** (menu ⋯) : plein écran, compteur de syllabes ≈ (automatique avec #poème), versions. Les versions restent sur l'appareil (non synchronisées). Le décompte de syllabes est approximatif (pas de diérèse).
