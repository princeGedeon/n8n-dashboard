// Champs modifiables depuis le dashboard admin, par table (les champs calculés sont exclus)
export const WRITABLE: Record<string, string[]> = {
  Clients: [
    'Clé primaire (Nom + Prénom)', 'Nom', 'Prenom', 'Email', 'AutreEmail', 'Numéro de téléphone', 'Régime alimentaire',
    'Taille', 'Moucheur', 'Apporteur', 'Source', 'Address Line 1', 'Address Line 2', 'City', 'Postal Code', 'Country',
    'Company', 'Notes relance', "Date d'entrée (Client)",
  ],
  'Séjour': [
    'Date de début', 'Date de fin', 'Logement principal', 'Chef de groupe', 'Participants (Séjour)',
    'Accompagnants (Séjour)', 'Nombre de pêcheurs', 'Formule', 'Status', 'Brief attentes', 'Remarques',
    'Pourcentage_acompte_annee',
  ],
  'Comptabilité': [
    'Client', 'ID_Séjour', 'Formule', 'Type', 'Tarif individuel', 'Date_acompte 1', 'Type_acompte 1',
    'Date_acompte 2', 'Type_acompte 2', 'Date_solde', 'Type_solde', 'Mail confirmation', 'Contrat envoyé',
    'Contrat signé', 'Email tic tac',
  ],
  Association_Logement: ['ID_Séjour', 'Clients', 'Logement', 'Statut', 'Date de création'],
  Association_Guides: ['ID_Séjour', 'Client', 'Guide', 'Statut', 'Commentaires', "Date d'association"],
  Association_bateau: ['ID_Séjour', 'Clients', 'Bateau', 'Statut', 'Date de création'],
  Association_Materiel: [
    'ID_Séjour', 'Clients ( Séjour)', 'Materiel', 'Statut', 'Tarif', 'Deposit', 'Type de paiement',
    'Date_de_paiement', 'Commentaire', "Date d'association",
  ],
  Trajet: [
    'Date du trajet départ', 'Date du trajet arrivée', 'Aéroport de départ/arrivée', 'Chauffeurs / Staff', 'Clients',
    'Séjour', 'Remarques', 'Véhicules utilisés',
  ],
};

// Champs Clients envoyés au navigateur (évite de transférer les 64 colonnes)
export const CLIENT_FIELDS = [
  'Clé primaire (Nom + Prénom)', 'Nom', 'Prenom', 'Email', 'AutreEmail', 'Numéro de téléphone', 'Régime alimentaire',
  'Taille', 'Moucheur', 'Apporteur', 'Source', 'Address Line 1', 'Address Line 2', 'City', 'Postal Code', 'Country',
  'Company', 'Notes relance', "Date d'entrée (Client)",
];

export const ADMIN_TABLES = [
  'Clients', 'Séjour', 'Comptabilité', 'Logement', 'Association_Logement', 'Staff', 'Association_Guides', 'Bateau',
  'Association_bateau', 'Materiel', 'Association_Materiel', 'Trajet',
] as const;

export const primaryKey = (nom: unknown, prenom: unknown) =>
  [String(nom ?? '').trim().toUpperCase(), String(prenom ?? '').trim()].filter(Boolean).join(' ');
