INSTALLATION iPHONE - FEUILLE RECETTE TOUCH

IMPORTANT
Cette version est une vraie application web hors ligne (PWA).
Sur iPhone, une PWA doit être ouverte une première fois avec un lien HTTPS pour être ajoutée à l'écran d'accueil.
Après l'ajout à l'écran d'accueil, elle fonctionne sans internet.

FICHIERS
- index.html : application
- manifest.webmanifest : configuration d'installation
- sw.js : cache hors ligne
- logo.png / wordmark.png : logos repris depuis la photo fournie
- icon-192.png / icon-512.png / apple-touch-icon.png : icônes

INSTALLATION SIMPLE
1. Dézipper le dossier.
2. Héberger le dossier sur un service statique HTTPS, par exemple GitHub Pages, Netlify, Cloudflare Pages, Replit, ou un petit serveur interne.
3. Ouvrir l'adresse HTTPS dans Safari sur iPhone.
4. Appuyer sur Partager.
5. Appuyer sur Ajouter à l'écran d'accueil.
6. Ouvrir l'icône créée.
7. Faire un test en mode avion. L'application doit encore ouvrir.

UTILISATION
- Date automatique : le champ Date se remplit seul avec la date du jour si la case est vide. Toucher le champ Date remet la date du jour.
- Toucher une case HEURE : inscrit l'heure actuelle automatiquement.
- Toucher A1, A2, B2, etc. : ajoute un trait vertical.
- 1 tap = │
- 2 taps = ││
- 3 taps = │││
- Appui long sur une case minerai : efface cette case.
- Toucher Numéro Loader : entre le numéro.
- Toucher Silo ou Cr-Pad : coche la destination.
- Exporter CSV : sauvegarde une copie des données.
- Imprimer/PDF : crée une sortie imprimable.
- Reset feuille : efface la feuille sur ce téléphone.

DONNÉES
Les données sont gardées localement dans le navigateur/appareil.
Aucune connexion externe n'est utilisée par l'application elle-même.


CORRECTIFS v1.2
- Boutons Zoom -, Zoom + et 100% ajoutés.
- Le zoom/pinch Safari est permis.
- Impression améliorée : date, numéro de camion, nom et champs d'en-tête restent visibles.
- Double toucher sur une case Numéro Loader répète le dernier loader utilisé sur une ligne précédente.
- Le cache hors ligne a été mis à jour. Après upload, ouvrir l'app une fois avec internet pour recevoir la nouvelle version.


CORRECTIFS v1.3
- Ajout de pages multiples : Page -, Page +, + Nouvelle page, Supprimer page.
- Chaque page contient sa propre feuille de 60 voyages.
- Poids et # de voyage sont sauvegardés séparément pour chaque page.
- Export CSV inclut toutes les pages.
- Les anciennes données v1.2 sont migrées automatiquement en page 1.

CORRECTIFS v1.4
- Correction impression: la date complète, le no de camion et l’en-tête sont maintenant plus lisibles en PDF/impression.
- Vraies pages multiples: Page -, Page +, + Nouvelle page et Supprimer page.
- Poids et # de voyage par page.
- Export CSV de toutes les pages.
- Après mise à jour Netlify, ouvrir l’app une fois avec internet pour rafraîchir le cache hors ligne.


CORRECTIFS v1.5
- Boutons Zoom -, Zoom + et 100% retirés.
- Zoom naturel iPhone: pincer l’écran avec deux doigts.
- Meilleure compatibilité iPhone/PWA: barre supérieure moins collée au statut iOS.
- Impression encore ajustée pour afficher la date complète et le no de camion.
- Garde les pages multiples, le double touch loader, l’export CSV et le mode hors ligne.


CORRECTIFS v1.6
- Ajout de Vue complète: réduit automatiquement la feuille pour voir toute la page sur l’écran.
- Ajout de Vue saisie: revient à la grandeur normale pour remplir les cases facilement.
- Les anciens boutons Zoom -, Zoom + et 100% restent retirés.
- Le pinch iPhone reste permis, mais Vue complète est nécessaire pour voir toute la feuille car iOS ne zoome pas sous 100% avec les doigts.


CORRECTIFS v1.7
- Ajout d’une ligne TOTAL en bas du tableau.
- Les colonnes A1, A2, B2, etc. totalisent automatiquement les buckets.
- Les colonnes Silo et Cr-Pad totalisent automatiquement les destinations cochées.
- La colonne Numéro Loader affiche le nombre de voyages remplis.
- Ajout de Cacher menu et d’un bouton flottant ☰ Menu pour retrouver les boutons.
- Le menu caché laisse plus d’espace pour Vue complète.


CORRECTIFS v1.8
- Le champ Poids se calcule automatiquement : nombre de voyages x 40 tonnes.
- Le champ # de voyage se calcule automatiquement selon les lignes remplies.
- Le total de voyages n’est plus affiché dans la colonne Numéro Loader.
- La ligne TOTAL garde seulement les totaux de buckets par minerai et les totaux Silo / Cr-Pad.
- Double tap zoom désactivé pour ne pas nuire au double touch du loader.
- Pinch avec deux doigts reste permis pour zoomer manuellement.


CORRECTIFS v1.9
- Traits de buckets plus gras et plus lisibles à l’écran et à l’impression.
- Impression resserrée pour que 1 feuille de l’application tienne sur 1 page imprimée complète.
- Marges d’impression réduites, entête et tableau compressés, lignes plus compactes.
- Toujours compatible avec le calcul automatique du poids et du nombre de voyages.


CORRECTIFS v2.0
- 1 tap sur un minerai affiche ❙.
- 2 taps sur le même minerai affichent ❙❙.
- 3 taps sur le même minerai affichent X au lieu de trois traits.
- Les totaux restent corrects: X compte toujours pour 3 buckets.


CORRECTIFS v2.1
- Les lignes doivent maintenant être utilisées en ordre.
- Impossible de cocher ou remplir une ligne plus basse que la prochaine ligne réelle.
- Exemple: si les lignes 1 et 2 sont remplies, l’application bloque la ligne 7 et demande de remplir la ligne 3.
- La prochaine ligne valide est légèrement indiquée.


CORRECTIFS v2.2
- Priorité obligatoire: l’heure de chargement doit être inscrite avant de cocher minerai, loader ou destination.
- Impossible d’utiliser une ligne plus basse tant que la ligne actuelle n’a pas l’heure et 3 buckets.
- Exemple: ligne 1 doit avoir une heure + 3 buckets avant que la ligne 2 soit disponible.
- # de voyage et Poids comptent seulement les lignes complètes: heure + 3 buckets.


CORRECTIFS v2.3
- Ajout d’un bouton English / Français.
- L’interface principale peut maintenant basculer en français ou en anglais.
- Le choix de langue est sauvegardé hors ligne sur le téléphone.
- Les boutons, messages, instructions, champs principaux et modale Loader sont traduits.


CORRECTIFS v2.4
- Le bouton English / Français traduit maintenant aussi la feuille de recette.
- Traduction ajoutée pour Recette / Receipt, Voyage / Trip, Heure du chargement / Loading time, Numéro Loader / Loader Number.
- Date, Nom, No de Camion, Poids et # de voyage restent synchronisés avec la langue choisie.
- Les noms officiels de secteurs/minerais comme Anuri, Qaki, A1, B2, Silo et Cr-Pad restent inchangés.


CORRECTIFS v2.5
- Les lignes de buckets sont maintenant plus fines, mieux espacées et moins collées.
- 3 taps affiche toujours X.
- La ligne jaune de sélection / prochaine ligne ne s’imprime plus.
- L’écran garde l’indication de prochaine ligne, mais le PDF/impression reste propre si la ligne est vide à la fin.

CORRECTIFS v2.6
- Le descriptif sous le menu bascule maintenant aussi correctement en anglais.
- Le texte d’installation ET le texte explicatif suivent maintenant la langue choisie.

CORRECTIFS v2.7
- Les cases minerai remplies restent blanches: plus de fond vert derrière les traits et les X.
- Nouveau bouton Feuille loader dans le menu.
- Nouvelle feuille recette loader imprimable avec pourcentages (A1, B2, Boulder, etc.), total automatique et notes.


CORRECTIFS v2.8
- La feuille loader calcule maintenant les tonnes estimées par minerai selon le tonnage cible.
- La feuille loader calcule aussi les buckets estimés.
- Règle utilisée: 1 voyage de 3 buckets = 40 tonnes, donc 1 bucket ≈ 13.33 tonnes.
- Exemple: tonnage cible 2800 t et A1 15% = 420 t ≈ 31.5 buckets.


CORRECTIFS v2.9
- Ajout du nom d’opérateur sur la feuille loader.
- La feuille loader permet maintenant d’entrer les buckets faits par minerai.
- Le suivi affiche automatiquement fait / cible et le restant.
- Quand la cible est atteinte, le statut affiche Complet / Complete.
- Exemple: cible 9 buckets, faits 8 = 8/9 - 1 reste; faits 9 = 9/9 Complet.


CORRECTIFS v3.0
- Sur la feuille loader, la colonne Buckets faits fonctionne maintenant par tap.
- Chaque tap ajoute 1 bucket automatiquement.
- Le total s’accumule jusqu’à la cible prévue.
- Appui long sur la case Buckets faits retire 1 bucket.


CORRECTIFS v3.1
- Ajout d’un header fixe Kiewit avec l’image fournie.
- Menu burger fixe intégré au header.
- Bouton Cacher menu retiré.
- Le menu complet s’ouvre et se ferme avec le burger.


CORRECTIFS v3.3
- Ajout du mode nuit pour réduire l’éblouissement dans le camion.
- Bouton Mode nuit: Auto / ON / OFF dans le menu.
- En Auto, le mode nuit s’active entre 19:00 et 06:00.
- L’impression/PDF reste en mode clair original même si le mode nuit est actif.


CORRECTIFS v3.4
- Correction du mode Vue complète.
- Le header devient plus compact en Vue complète.
- La feuille commence plus bas pour ne plus être cachée sous le header.
- Meilleur ajustement vertical de la feuille à l’écran.


CORRECTIFS v3.6
- Impression/PDF ajustée pour que la grille remplisse beaucoup plus la page.
- Suppression de l’échelle trop petite qui donnait une grille à environ 3/4 de page.
- La feuille reste optimisée pour une seule page imprimée en mode paysage.
