# 🚀 CasperFlow — Guide de démarrage (aucune connaissance requise)

Bienvenue ! Ce dossier contient la première version de CasperFlow : le canevas visuel
pour construire des agents IA sur Casper Network. Suis ces étapes dans l'ordre.

## Étape 1 — Installer Node.js (une seule fois, ~3 minutes)

Node.js est le moteur qui fait tourner l'application sur ton Mac.

1. Va sur **https://nodejs.org**
2. Clique sur le gros bouton vert **LTS** (version recommandée)
3. Ouvre le fichier téléchargé et suis l'installation (Suivant, Suivant, Installer)

## Étape 2 — Lancer CasperFlow (~2 minutes la première fois)

1. Ouvre l'application **Terminal** (Cmd + Espace, tape « Terminal », Entrée)
2. Copie-colle cette ligne puis appuie sur Entrée :

   ```
   cd ~/Desktop/Code/CasperFlow && npm install
   ```

   ⏳ Attends 1-2 minutes : ça télécharge les briques du projet (une seule fois).

3. Puis copie-colle :

   ```
   npm run dev
   ```

4. Le Terminal affiche une adresse du type `http://localhost:5173`.
   **Ouvre cette adresse dans ton navigateur** (Cmd + clic sur le lien, ou copie-la).

🎉 Tu devrais voir le canevas CasperFlow avec le template « Sentinelle CSPR » déjà
en place. Clique sur **▶ Simuler** pour voir l'agent s'exécuter étape par étape.

## Ce que tu peux faire dès maintenant

- **Glisser** des modules depuis la palette de gauche vers le canevas
- **Connecter** les modules : tire un trait depuis le point droit d'un module
  vers le point gauche du suivant
- **Supprimer** un module ou un lien : clique dessus puis touche Retour arrière
- **▶ Simuler** : l'agent parcourt le flux et raconte ce qu'il fait dans le
  journal à droite

⚠️ Pour l'instant tout est **simulé** (aucune vraie transaction) — c'est voulu :
on valide l'interface avant de brancher le vrai testnet Casper.

## Pour arrêter / relancer l'application

- Arrêter : dans le Terminal, appuie sur **Ctrl + C**
- Relancer plus tard : `cd ~/Desktop/Code/CasperFlow && npm run dev`

## Tes 2 actions de la semaine (en dehors du code)

1. **S'inscrire au buildathon** (gratuit, 5 min) :
   https://dorahacks.io/hackathon/2202/detail → bouton **« Register as Hacker »**
   (compte avec ton email ou GitHub, pas besoin de Discord)
2. **Créer un compte GitHub** si tu n'en as pas (github.com) — le règlement
   exige une soumission open source, on y mettra le code.

## La suite (notre planning sur 3 semaines)

- **Semaine 1 (maintenant)** : canevas fonctionnel en simulation ← tu es ici
- **Semaine 2** : vraies données Casper (prix CSPR.trade, événements on-chain)
  + moteur d'exécution qui tourne en continu
- **Semaine 3** : paiement x402 + swap testnet + module Décision IA réelle,
  puis vidéo de démo et soumission avant le **1er juillet**

Si quelque chose ne marche pas, copie le message d'erreur du Terminal et
montre-le à Claude — on corrige ensemble.
