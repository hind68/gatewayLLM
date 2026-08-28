# CLAUDE.md

## Règle permanente — Dossier d'Architecture Technique (DAT)

Le projet maintient un Dossier d'Architecture Technique de référence :

`documents/DAT.docx`

Toute modification du code, de l'architecture, des API, de la base de données,
de la sécurité, du DLP, de l'authentification (Keycloak), de Docker/infrastructure,
de LiteLLM ou des fonctionnalités doit entraîner une vérification de
`documents/DAT.docx`.

Avant de considérer une tâche comme terminée, Claude doit se demander :

> « Est-ce que ce changement rend une information de `documents/DAT.docx`
> incorrecte, incomplète ou obsolète ? »

Si oui, Claude doit mettre à jour `documents/DAT.docx` dans la même tâche,
avant de considérer le travail comme terminé :

1. Modifier uniquement les sections concernées (ne pas régénérer tout le document).
2. Préserver la mise en page, les styles et la structure existante.
3. Mettre à jour les tableaux concernés (endpoints, tables, ports, dépendances, etc.).
4. Régénérer les diagrammes concernés si leur contenu a changé.
5. Supprimer les informations devenues obsolètes plutôt que de les laisser à côté
   des informations à jour.
6. Mettre à jour la date de dernière mise à jour et la version du document.
7. Enregistrer la mise à jour dans le même fichier `documents/DAT.docx`
   (ne jamais créer `DAT-v2.docx`, `DAT-new.docx`, `DAT-final.docx`, etc.).

Le code est toujours la source de vérité. Le DAT doit refléter le code, jamais
l'inverse. Ne rien documenter dans le DAT qui ne soit pas vérifiable dans le
repository actuel (code source, configuration, migrations, Docker, tests).

Le générateur du document est en Python (`python-docx`), réparti sur trois
fichiers dans `documents/` :

- `generate_dat.py` — squelette du document (page de garde, styles, en-tête/
  pied de page, table des matières) et point d'entrée (`python generate_dat.py`).
- `dat_content.py` — contenu des 23 sections (une fonction `add_section_NN`
  par section), à modifier quand une information devient obsolète.
- `build_diagrams.py` — génère les images dans `documents/diagrams/`
  (architecture globale, modèle de données, pipeline DLP, séquence chat) ;
  à ré-exécuter (`python build_diagrams.py`) puis relancer `generate_dat.py`
  quand un diagramme doit changer.

Pour mettre à jour le DAT : modifier la section concernée dans
`dat_content.py` (et le diagramme concerné dans `build_diagrams.py` si
nécessaire), puis exécuter `python documents/generate_dat.py` depuis
`documents/` pour régénérer `documents/DAT.docx` en place.
