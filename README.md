# Formulaires Lapland — dashboard admin + formulaire client

Application web (Astro + React + Tailwind) qui écrit **directement dans Airtable** (base *CRM LAPLAND FL*) en passant par **n8n**.

- **`/admin`** : dashboard pour l'équipe (un mot de passe partagé).
- **`/`** : formulaire public de demande de réservation pour les clients.

---

## 1. Ce que ça fait

### Dashboard admin (`/admin`)
| Onglet / écran | Ce qu'on y fait |
|---|---|
| **Saison** | Liste des séjours de l'année choisie, avec pastilles de complétude par séjour : compta, mail de confirmation, contrat signé, chambre, guide (ex. `2/3` = 2 personnes sur 3 faites). Totaux CA et **TotalAcompte versé** (acompte 1 + acompte 2 dont la date est remplie). |
| **Clients** | Recherche instantanée (nom, email, téléphone) parmi tous les clients, sans requête réseau. Bouton « Nouveau client ». |
| **Fiche client** | Modifier la fiche ; champs importants vides en orange ; **alerte doublon** (même email ou même nom + prénom) ; liste de ses séjours ; « + Nouveau séjour » pré-rempli avec la formule de l'an dernier. |
| **Séjour** | Dates, statut, formule, logement principal, chef de groupe, participants, accompagnants, brief, remarques. Alerte si une personne a déjà un séjour sur ces dates. |
| **Nouveau séjour (tout en une fois)** | Après les dates et les personnes, une ligne par personne permet de choisir **chambre, guide, bateau et matériel** (avec disponibilités sur les dates). Un seul bouton **« Créer le séjour et les attributions »** crée le séjour, les associations et (case cochée par défaut) une ligne **Comptabilité** par personne avec type et formule pré-remplis. |
| **Suivi par client** (séjour existant) | Pour chaque personne : **chambre** (lits pris / libres), **guide**, **bateau**, **matériel** (stock pris / disponible) — enregistrés dès qu'on les choisit — et la ligne **Comptabilité** : tarif, dates et types des acomptes et du solde, **Mail confirmation, Contrat envoyé, Contrat signé, Email tic tac** (propres à chaque client, pas communs au groupe). |
| **Trajets aéroport** (séjour existant) | Boutons « + Trajet aller / retour » pré-remplis avec les dates du séjour : heures, aéroport, chauffeur(s), passagers (tout le groupe coché par défaut), véhicule, remarques. |
| **Régénérer les Excel** | Relance le workflow `suivi_saison` pour l'année choisie (fichiers Google Drive mis à jour en 1 à 2 minutes). |

Les données sont chargées **une fois** à l'ouverture (bouton *Actualiser* pour recharger). Chaque enregistrement envoie **une seule** requête et met à jour l'écran sans tout recharger.

Les montants d'acompte et de solde sont **calculés par Airtable** (formules) ; on saisit seulement le tarif, les dates de versement et les types de paiement.

### Formulaire client (`/`)
Volontairement **limité au client lui-même** : 3 étapes **Vos informations → Séjour souhaité → Envoi**. Pas de saisie des autres membres du groupe : le client indique seulement le nombre de pêcheurs et d'accompagnants, **l'admin ajoute les participants** dans le dashboard.

1. Le serveur cherche le client par email dans la table **Clients**.
   - **Inconnu** → la fiche est créée (`Source = Formulaire web`).
   - **Déjà connu** → la fiche **n'est pas modifiée** (personne ne peut écraser les données d'un client en connaissant son email) ; les infos saisies sont recopiées dans les *Remarques* du séjour « à vérifier ».
2. Un **séjour** est créé avec le statut **Attente**, le client comme chef de groupe, le brief, et dans *Remarques* : taille du groupe annoncée et vols. L'admin complète le groupe et valide (statut *Active*).
3. La réponse est toujours neutre : le formulaire ne révèle jamais si un email existe déjà.

### n8n : workflow `forms_api`
L'app ne parle **jamais** directement à Airtable : elle appelle des webhooks n8n, depuis le **serveur** (le navigateur ne voit ni n8n ni aucune clé).

| Webhook | Rôle | Protection |
|---|---|---|
| `POST /webhook/forms/login` | vérifie le mot de passe admin | Basic Auth (utilisateur `admin`) |
| `GET /webhook/forms/read?table=…&formula=…` | lit une table (liste blanche de tables) | en-tête `X-Forms-Key` |
| `POST /webhook/forms/write` | crée (`POST`) ou modifie (`PATCH`) ≤ 10 lignes | en-tête `X-Forms-Key` |
| `GET /webhook/forms/schema` | champs et listes de choix (formules, statuts…) | en-tête `X-Forms-Key` |

Tables lisibles : Clients, Séjour, Comptabilité, Logement, Staff, Bateau, Materiel, Trajet, Pourcentage_Annee et les tables Association_*.
Tables modifiables : Clients, Séjour, Comptabilité, Association_Logement, Association_Guides, Association_bateau, Association_Materiel, Trajet. Les tables Contact, Prospects, Staff, Logement, Bateau, Materiel ne sont **jamais** modifiables depuis l'app.

---

## 2. Mot de passe admin : où le définir

Le mot de passe est stocké **dans n8n**, pas dans l'app :

1. n8n → **Overview › Credentials** (ou *Identifiants*).
2. Ouvrir **« Formulaires — mot de passe admin »** (type *Basic Auth*).
3. Laisser l'utilisateur **`admin`**, changer le **mot de passe**, enregistrer.

C'est pris en compte immédiatement (pas besoin de redémarrer l'app). Les personnes déjà connectées restent connectées jusqu'à la fin de leur session (12 h max) ; cliquer sur *Déconnexion* pour en sortir.

> Un mot de passe initial a été généré et écrit en commentaire dans `formulaires/.env`. **Changez-le dans n8n puis supprimez cette ligne.**

Protection contre les essais : 5 tentatives par adresse IP toutes les 15 minutes.

### Clé serveur (X-Forms-Key)
Identifiant n8n **« Formulaires — clé serveur (X-Forms-Key) »** (type *Header Auth*). Sa valeur doit être **identique** à `N8N_FORMS_KEY` dans le `.env` de l'app. Pour la changer : modifier les deux, puis redémarrer l'app.

---

## 3. Sécurité (résumé)

- Secrets uniquement côté serveur (`.env`, identifiants n8n). Rien dans le code envoyé au navigateur.
- Session admin : cookie signé (HMAC), `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS, 12 h.
- Toute requête d'écriture venant d'un autre site est refusée (vérification de l'en-tête `Origin`).
- Pages admin : `noindex`, pas de cache, interdites dans une iframe.
- Le serveur ne transmet que des champs autorisés (liste blanche par table) ; les champs calculés ne sont jamais écrits.
- Formulaire client : validation côté serveur, champ piège anti-robot, 5 envois par IP et par heure, captcha **Cloudflare Turnstile** facultatif.
- Les identifiants Airtable restent dans n8n.

---

## 4. Configuration (`.env`)

Copier `.env.example` en `.env` (déjà créé localement par le script de déploiement n8n) :

| Variable | Rôle |
|---|---|
| `N8N_URL` | adresse de n8n, ex. `https://n8n.srv1004594.hstgr.cloud` |
| `N8N_FORMS_KEY` | même valeur que l'identifiant n8n *Formulaires — clé serveur* |
| `SESSION_SECRET` | 32+ caractères aléatoires : `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | captcha (facultatif, vide = désactivé) |

### Activer le captcha Turnstile (gratuit)
1. https://dash.cloudflare.com → **Turnstile** → *Add widget*.
2. Domaine : celui du formulaire (ex. `reservation.mondomaine.com`), mode *Managed*.
3. Copier la *Site key* et la *Secret key* dans le `.env`, redémarrer l'app.

---

## 5. Tester en local (Windows / Mac / Linux)

Prérequis : Node.js 22.12+ (24 recommandé).

```bash
cd formulaires
npm install
npm run dev          # http://localhost:4321  (formulaire)  ·  http://localhost:4321/admin
```

Version de production en local :

```bash
npm run build
node --env-file=.env dist/server/entry.mjs     # http://localhost:4321
```

Tests automatiques (sans rien créer dans Airtable) :

```bash
node workflows/test/forms_api.cjs                                # webhooks n8n
node workflows/test/formulaires_e2e.cjs http://127.0.0.1:4321    # app complète (serveur lancé)
```

> ⚠️ Envoyer le formulaire client en local **crée réellement** un client et un séjour (statut *Attente*) dans Airtable. Passer ensuite le séjour en *Inactive*.

---

## 6. Déployer sur le serveur Linux (Docker)

### 6.1 Prérequis
- Docker + Docker Compose (déjà présents si n8n tourne en Docker : vérifier avec `docker ps`).
- Un sous-domaine pointant vers l'IP du serveur, ex. `reservation.mondomaine.com` (enregistrement DNS **A**).

### 6.2 Copier l'application
Depuis ton PC (sans `node_modules`, `dist`, `.astro`) :

```bash
# depuis le dossier n8n/
scp -r formulaires/Dockerfile formulaires/docker-compose.yml formulaires/package.json formulaires/package-lock.json \
       formulaires/astro.config.mjs formulaires/tsconfig.json formulaires/src formulaires/.env \
       utilisateur@IP_DU_SERVEUR:/opt/formulaires/
```

(ou `git clone` si le projet est sur un dépôt privé, puis créer le `.env` sur le serveur).

### 6.3 Lancer

```bash
cd /opt/formulaires
docker compose up -d --build
docker compose logs -f          # Ctrl+C pour quitter
curl -I http://127.0.0.1:4321/admin/login    # doit répondre 200
```

L'app écoute **seulement en local** (`127.0.0.1:4321`). Il faut un reverse proxy pour le HTTPS, au choix :

### 6.4 a) Le serveur utilise déjà Traefik (cas fréquent du modèle n8n Hostinger)

Vérifier : `docker ps` montre un conteneur `traefik`. Récupérer le nom du *certresolver* et du réseau utilisés par n8n :

```bash
docker inspect $(docker ps -qf name=n8n) --format '{{json .Config.Labels}}' | tr ',' '\n' | grep -i -E 'certresolver|entrypoints'
docker inspect $(docker ps -qf name=n8n) --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

Remplacer alors `docker-compose.yml` par (adapter `mytlschallenge`, `websecure` et `NOM_DU_RESEAU`) :

```yaml
services:
  formulaires:
    build: .
    container_name: formulaires
    restart: unless-stopped
    env_file: .env
    networks: [proxy]
    labels:
      - traefik.enable=true
      - traefik.http.routers.formulaires.rule=Host(`reservation.mondomaine.com`)
      - traefik.http.routers.formulaires.entrypoints=websecure
      - traefik.http.routers.formulaires.tls.certresolver=mytlschallenge
      - traefik.http.services.formulaires.loadbalancer.server.port=4321
networks:
  proxy:
    external: true
    name: NOM_DU_RESEAU
```

puis `docker compose up -d --build`.

### 6.4 b) Caddy (simple, HTTPS automatique)

```caddy
reservation.mondomaine.com {
    reverse_proxy 127.0.0.1:4321
}
```

`sudo systemctl reload caddy`

### 6.4 c) Nginx + Certbot

```nginx
server {
    server_name reservation.mondomaine.com;
    location / {
        proxy_pass http://127.0.0.1:4321;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

puis `sudo certbot --nginx -d reservation.mondomaine.com`.

> Le proxy doit transmettre `Host` (ou `X-Forwarded-Host`) et `X-Forwarded-Proto`. Sans cela, les enregistrements sont refusés (« Origine refusée ») ou le cookie n'est pas sécurisé.

### 6.5 Adresses finales
- Formulaire client : `https://reservation.mondomaine.com/`
- Admin : `https://reservation.mondomaine.com/admin`

---

## 6 bis. Mettre le projet sur Git (GitHub privé)

Le `.gitignore` à la racine exclut déjà les secrets (`.env`), les données clients (`backups/`, `exemple_tableau_a_generer/`) et les fichiers générés.

**Sur ton PC** (une seule fois), dans le dossier `n8n/` :

1. Créer un dépôt **privé** vide sur https://github.com/new (ex. `lapland-n8n`), sans README.
2. Puis :

```bash
git init
git add .
git status                      # vérifier qu'aucun .env, backups/ ou .xlsx n'apparaît
git commit -m "Formulaires admin + client, workflows n8n"
git branch -M main
git remote add origin https://github.com/TON_COMPTE/lapland-n8n.git
git push -u origin main
```

Ensuite, à chaque modification : `git add . && git commit -m "description" && git push`.

> ⚠️ Si `git status` montre un fichier `.env` : **ne pas committer**, vérifier le `.gitignore`. Une clé publiée par erreur doit être changée (Airtable, n8n).

---

## 6 ter. Déployer sans Docker (Node + systemd)

Toutes les commandes se tapent **sur le serveur** (connecté en SSH avec un utilisateur qui a `sudo`).

### 1. Installer Node.js 24 et Git

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v        # doit afficher v24.x (minimum v22.12)
```

### 2. Créer un utilisateur dédié (sans droits admin)

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin formulaires
sudo mkdir -p /opt/lapland && sudo chown formulaires:formulaires /opt/lapland
```

### 3. Récupérer le code depuis GitHub

Dépôt privé : créer une **clé de déploiement** en lecture seule.

```bash
sudo -u formulaires -H ssh-keygen -t ed25519 -N "" -f /home/formulaires/.ssh/id_ed25519
sudo cat /home/formulaires/.ssh/id_ed25519.pub
```

Copier la clé affichée dans GitHub › dépôt › **Settings › Deploy keys › Add deploy key** (ne pas cocher *Allow write access*). Puis :

```bash
sudo -u formulaires -H git clone git@github.com:TON_COMPTE/lapland-n8n.git /opt/lapland
```

(répondre `yes` à la question sur l'empreinte de github.com)

### 4. Créer le `.env` sur le serveur

Le `.env` n'est pas sur Git : le recréer en copiant les valeurs de ton `formulaires/.env` local.

```bash
sudo -u formulaires cp /opt/lapland/formulaires/.env.example /opt/lapland/formulaires/.env
sudo nano /opt/lapland/formulaires/.env          # coller N8N_URL, N8N_FORMS_KEY, SESSION_SECRET
sudo chmod 600 /opt/lapland/formulaires/.env
sudo chown formulaires:formulaires /opt/lapland/formulaires/.env
```

### 5. Installer et compiler

```bash
cd /opt/lapland/formulaires
sudo -u formulaires -H npm ci
sudo -u formulaires -H npm run build
```

### 6. Lancer en service (démarrage automatique)

```bash
sudo cp /opt/lapland/formulaires/deploy/formulaires.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now formulaires
systemctl status formulaires                       # doit afficher « active (running) »
curl -I http://127.0.0.1:4321/admin/login          # doit répondre 200
```

Journaux : `journalctl -u formulaires -f` (Ctrl+C pour quitter).

L'app écoute seulement sur `127.0.0.1:4321`. Il faut encore le **HTTPS** (étape 7).

### 7. HTTPS : qui occupe déjà les ports 80/443 ?

```bash
sudo ss -tlnp | grep -E ':(80|443)\b'
docker ps 2>/dev/null
```

- **Rien sur 80/443** → installer Caddy (le plus simple, certificat automatique) :

  ```bash
  sudo apt-get install -y caddy
  echo 'reservation.mondomaine.com {
      reverse_proxy 127.0.0.1:4321
  }' | sudo tee /etc/caddy/Caddyfile
  sudo systemctl reload caddy
  ```

- **nginx** sur 80/443 → bloc Nginx de la section 6.4 c, puis `sudo certbot --nginx -d reservation.mondomaine.com`.
- **docker-proxy / Traefik** sur 80/443 (modèle n8n Hostinger) → Traefik tourne dans Docker et ne voit pas facilement une app lancée hors Docker. Le plus simple dans ce cas : utiliser la **méthode Docker** (section 6.4 a). Sinon, envoyer la sortie des deux commandes ci-dessus pour adapter la configuration.

Le DNS du sous-domaine (`reservation.mondomaine.com`, enregistrement **A** vers l'IP du serveur) doit exister avant de lancer Caddy ou Certbot.

### 8. Mettre à jour plus tard

Sur le PC : `git push`. Sur le serveur :

```bash
sudo bash /opt/lapland/formulaires/deploy/update.sh
```

Le script récupère le code, recompile, redémarre le service et vérifie qu'il répond.

---

## 7. Mettre à jour (Docker)

```bash
# recopier les fichiers modifiés (src/ etc.) puis :
cd /opt/formulaires
docker compose up -d --build
```

Workflow n8n `forms_api` (après modification de `workflows/deploy_forms.js`) :

```bash
node workflows/deploy_forms.js
```

Le script ne recrée pas les identifiants s'ils existent déjà (IDs dans `workflows/ids.json`) et ne touche pas au mot de passe admin.

---

## 8. Structure

```
formulaires/
├─ src/pages/index.astro              formulaire client
├─ src/pages/admin/login.astro        connexion admin
├─ src/pages/admin/index.astro        dashboard
├─ src/pages/api/client.ts            traitement du formulaire client (création client / séjour)
├─ src/pages/api/admin/*.ts           login, logout, data (lecture), save (écriture), regenerate
├─ src/components/admin/*.tsx         écrans du dashboard
├─ src/components/client/ClientForm.tsx
├─ src/lib/n8n.ts                     appels aux webhooks n8n
├─ src/lib/fields.ts                  champs autorisés en écriture, par table
├─ src/lib/session.ts                 session admin signée
├─ src/middleware.ts                  protection /admin + anti-CSRF + en-têtes de sécurité
├─ Dockerfile, docker-compose.yml, .env.example
workflows/
├─ deploy_forms.js                    crée / met à jour le workflow n8n forms_api
├─ test/forms_api.cjs                 tests des webhooks
└─ test/formulaires_e2e.cjs           test de bout en bout de l'app
```

---

## 9. À savoir / limites actuelles

- **Retirer une attribution** (choisir « — non attribué — » ou cliquer sur × pour le matériel) la passe en *Inactive* dans Airtable (rien n'est supprimé). Les tarifs / cautions de location de matériel se saisissent dans Airtable.
- Lors de la création d'un séjour, les disponibilités affichées ne tiennent pas compte des choix faits **dans le même formulaire** (ex. deux personnes du groupe dans la même chambre) : vérifier le nombre de lits.
- **Chargement du dashboard** : ~5 à 10 s (lecture de 12 tables via n8n). Ensuite tout est instantané.
- Le webhook **`/webhook/suivi-saison`** (régénération Excel) existait avant et **n'est pas protégé** : toute personne connaissant l'URL peut relancer la génération (sans pouvoir lire les données). À protéger plus tard si besoin.
- Le limiteur de tentatives est en mémoire : il repart à zéro au redémarrage du conteneur.
- Les membres du groupe sont ajoutés par l'admin (le formulaire client ne crée que le client lui-même).

## 10. Dépannage

| Problème | Cause probable / solution |
|---|---|
| « Service indisponible (n8n) » à la connexion | n8n arrêté ou `N8N_URL` faux. Vérifier que le workflow **forms_api** est actif. |
| Chargement du dashboard en erreur 403 | `N8N_FORMS_KEY` différent de la valeur de l'identifiant n8n *Formulaires — clé serveur*. |
| « Origine refusée » en enregistrant | le reverse proxy ne transmet pas `Host` / `X-Forwarded-Host` (voir 6.4). |
| Reconnexion demandée en boucle | site en HTTP alors que le cookie est `Secure` : passer en HTTPS, ou vérifier `X-Forwarded-Proto`. |
| Erreur Airtable 422 en enregistrant | valeur refusée par Airtable (ex. champ renommé). Le message exact s'affiche ; adapter `src/lib/fields.ts`. |
| Les listes (formules, statuts) sont vides | webhook `forms/schema` en erreur : vérifier l'exécution dans n8n › *Executions*. |
| Voir ce qui s'est passé | n8n › Executions (workflow *forms_api*) et `docker compose logs -f` sur le serveur. |
"# n8n-dashboard" 
