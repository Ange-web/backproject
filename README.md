# Backend API - Projet de Sécurité

API REST développée avec Node.js et Express pour des outils de sécurité et d'analyse.

## 🚀 Fonctionnalités

### Authentification
- **Inscription** : `POST /new/signup`
- **Connexion** : `POST /user/login`
- **JWT** : Authentification par token Bearer

### Outils de Scan
- **Scan IP** : `GET /scan/ip` - Récupération de l'IP publique
- **Scan URL** : `POST /scan/url` - Scan de vulnérabilités web avec Nuclei
- **Scan Port** : `POST /scan/port` - Scan de ports avec Nmap
- **Scan EXIF** : `POST /scan/exif` - Analyse des métadonnées d'images
- **IA Analysis** : `POST /scan/ia` - Analyse avec Ollama

### Gestion des Utilisateurs
- **Liste des utilisateurs** : `GET /` - Récupération de tous les utilisateurs

## 🛠️ Technologies

- **Node.js** v18+
- **Express.js** v5.1.0
- **PostgreSQL** (Neon)
- **JWT** pour l'authentification
- **bcryptjs** pour le hachage des mots de passe
- **Nmap** pour le scan de ports
- **Nuclei** pour le scan de vulnérabilités
- **ExifTool** pour l'analyse d'images
- **Cloudinary** pour le stockage d'images

## 📦 Installation

1. **Cloner le projet**
```bash
git clone <repository-url>
cd backproject
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configuration de l'environnement**
Créer un fichier `.env` à la racine :
```env
JWT_SECRET=your_jwt_secret_here
```

4. **Configuration de la base de données**
Le fichier `db.js` contient la configuration PostgreSQL (Neon).

5. **Démarrer le serveur**
```bash
JWT_SECRET=your_secret node app.js
```

Le serveur démarre sur `http://localhost:3000`

## 📚 API Endpoints

### Authentification

#### Inscription
```http
POST /new/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "username",
  "password": "password",
  "nom": "Nom",
  "prenom": "Prénom"
}
```

#### Connexion
```http
POST /user/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

**Réponse :**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "username": "username",
    "email": "user@example.com",
    "avatar_url": "https://..."
  }
}
```

### Scan de Sécurité

#### Récupérer l'IP publique
```http
GET /scan/ip
Authorization: Bearer <token>
```

#### Scanner une URL
```http
POST /scan/url
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://example.com"
}
```

#### Scanner des ports
```http
POST /scan/port
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "public",
  "ip": "1.1.1.1",
  "ports": [80, 443, 8080]
}
```

#### Analyser les métadonnées d'images
```http
POST /scan/exif
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <image_file>
```

## 🔧 Configuration

### CORS
Le serveur est configuré pour accepter les requêtes depuis `http://localhost:5173`. Pour modifier :

```javascript
app.use(cors({
  origin: "http://localhost:5173", // Modifier selon vos besoins
  methods: ["GET", "POST"],
  credentials: true
}));
```

### Base de données
Configuration PostgreSQL dans `db.js` :
- Connexion à Neon (PostgreSQL cloud)
- Pool de connexions configuré
- SSL activé

## 🚨 Prérequis Système

- **Node.js** v18 ou supérieur
- **Nmap** installé sur le système
- **Nuclei** installé sur le système
- **ExifTool** installé sur le système

### Installation des outils (Ubuntu/Debian)
```bash
# Nmap
sudo apt-get install nmap

# Nuclei
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest

# ExifTool
sudo apt-get install exiftool
```

## 📁 Structure du Projet

```
backproject/
├── app.js                 # Point d'entrée principal
├── db.js                  # Configuration base de données
├── package.json           # Dépendances
├── function/
│   ├── auth.js           # Middleware d'authentification
│   ├── inscription.js    # Routes d'inscription
│   ├── connexion.js      # Routes de connexion
│   ├── get_user.js       # Gestion des utilisateurs
│   └── scan/
│       ├── scanip.js     # Scan IP publique
│       ├── scanurl.js    # Scan de vulnérabilités web
│       ├── scanport.js   # Scan de ports
│       ├── exiftool.js   # Analyse EXIF
│       └── iaollama.js   # Analyse IA
└── uploads/              # Dossier de stockage temporaire
```

## 🔐 Sécurité

- Mots de passe hachés avec bcryptjs
- Authentification JWT avec expiration (1h)
- Validation des entrées utilisateur
- CORS configuré
- Headers de sécurité

## 🐛 Dépannage

### Erreur 404 sur les routes de scan
Vérifiez que le serveur a été redémarré après les modifications.

### Erreur 403 "Token invalide"
- Vérifiez que `JWT_SECRET` est défini
- Relogez-vous pour obtenir un nouveau token

### Erreur de connexion à la base de données
Vérifiez la configuration dans `db.js` et la connectivité réseau.

## 📝 Notes

- Le serveur doit être redémarré après modification des routes
- Les scans de ports nécessitent des privilèges système
- Les outils externes (Nmap, Nuclei) doivent être installés
- Le CORS est configuré pour le développement local

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request