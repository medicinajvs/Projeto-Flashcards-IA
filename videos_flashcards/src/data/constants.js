// Imagens
export const IMAGES = {
  drEva: "/assets/dra-eva.jpg", 
  karen: "/assets/karen.jpg",     
  lucienne: "/assets/lucienne.jpg", 
  clinic1: "/assets/clinica-1.jpg", 
  clinic2: "/assets/clinica-2.jpg", 
  clinic3: "/assets/clinica-3.jpg",
  // Foto de fundo alterada para um interior de consultório médico (gabinete) real e iluminado
  heroBg: "https://images.unsplash.com/photo-1581594693702-fbdc51b2763b?q=80&w=2000&auto=format&fit=crop"
};

export const TRANSLATIONS = {
  fr: {
    nav: { home: "Accueil", team: "L'Équipe", mission: "Mission & Enseignement", clinic: "Services", login: "Connexion", mySpace: "Mon Espace", book: "Prendre Rendez-vous" },
    hero: { 
      title: "Cabinet Médical du Seujet", 
      subtitle: "Cabinet médical formateur : transmission et formation des étudiants et internes.", 
      cta: "Prendre Rendez-vous" 
    },
    doctors: { title: "Notre Équipe", bio: "Biographie", contact: "Contact", book: "Prendre RDV" },
    testimonials: { title: "Témoignages", subtitle: "La confiance de nos patients" },
    clinic: { title: "Le Cabinet", inclusivity: "Espace inclusif", accessibility: "Accessible aux personnes à mobilité réduite" },
    sections: {
      mission: "Notre Mission",
      teaching: "Vocation Formatrice",
      services: "Nos Prestations",
      equipment: "Plateau Technique",
      care: "Salle de Soins (Procédures)",
      community: "Réseau Collaboratif",
      multilingual: "Un environnement multiculturel"
    },
    dashboard: {
      title: "Mon Espace Santé",
      backHome: "Retour à l'accueil",
      userDefault: "Utilisateur",
      incompleteProfile: "Profil incomplet",
      historyBtn: "Historique",
      editProfileBtn: "Modifier mon profil",
      logoutBtn: "Déconnexion",
      needApptTitle: "Besoin d'un rendez-vous ?",
      bookApptBtn: "Prendre Rendez-vous",
      historyTitle: "Historique des Contacts",
      noHistory: "Aucun historique trouvé.",
      noHistorySub: "Vos prises de rendez-vous apparaîtront ici.",
      redirectOneDoc: "Redirection OneDoc",
      phoneCall: "Appel Téléphonique",
      interestRecorded: "Intérêt enregistré"
    },
    footer: { rights: "Tous droits réservés.", privacy: "Politique de Confidentialité", quickLinks: "Liens Rapides", contact: "Contact" }
  },
  en: {
    nav: { home: "Home", team: "The Team", mission: "Mission & Teaching", clinic: "Services", login: "Login", mySpace: "My Space", book: "Book Appointment" },
    hero: { 
      title: "Cabinet Médical du Seujet", 
      subtitle: "Training medical practice: transmission and training of students and residents.", 
      cta: "Book Appointment" 
    },
    doctors: { title: "Our Team", bio: "Biography", contact: "Contact", book: "Book Now" },
    testimonials: { title: "Testimonials", subtitle: "Our patients' trust" },
    clinic: { title: "The Clinic", inclusivity: "Inclusive Space", accessibility: "Wheelchair Accessible" },
    sections: {
      mission: "Our Mission",
      teaching: "Formative Vocation",
      services: "Our Services",
      equipment: "Technical Equipment",
      care: "Care Room (Procedures)",
      community: "Collaborative Network",
      multilingual: "A multicultural environment"
    },
    dashboard: {
      title: "My Health Space",
      backHome: "Back to Home",
      userDefault: "User",
      incompleteProfile: "Incomplete Profile",
      historyBtn: "History",
      editProfileBtn: "Edit Profile",
      logoutBtn: "Logout",
      needApptTitle: "Need an appointment?",
      bookApptBtn: "Book Appointment",
      historyTitle: "Contact History",
      noHistory: "No history found.",
      noHistorySub: "Your appointments will appear here.",
      redirectOneDoc: "OneDoc Redirection",
      phoneCall: "Phone Call",
      interestRecorded: "Interest Recorded"
    },
    footer: { rights: "All rights reserved.", privacy: "Privacy Policy", quickLinks: "Quick Links", contact: "Contact" }
  }
};

export const CLINIC_VALUES = [
  { title: { fr: "Inclusion", en: "Inclusion" }, icon: "Heart" },
  { title: { fr: "Humanisme", en: "Humanism" }, icon: "Users" },
  { title: { fr: "Transmission", en: "Transmission" }, icon: "BookOpen" },
  { title: { fr: "Médecine de Qualité", en: "Quality Medicine" }, icon: "Star" },
  { title: { fr: "Médecine Intégrative", en: "Integrative Medicine" }, icon: "Activity" }
];

export const TEACHING_INFO = {
  title: { fr: "Enseignement Pré et Post-gradué", en: "Pre and Post-graduate Teaching" },
  description: {
    fr: "Le Cabinet du Seujet est un cabinet médical formateur dédié à la transmission du savoir. Nous assurons la formation continue, l'enseignement des étudiants et l'encadrement des résidents/internes. Nous dispensons l'enseignement clinique à l'UNIGE pour les étudiants de 2ème année de Bachelor et 3ème année de Master en Médecine Humaine.",
    en: "Cabinet du Seujet is a training medical practice dedicated to knowledge transmission. We provide continuous education, student teaching, and resident training. We deliver clinical teaching at UNIGE for 2nd-year Bachelor and 3rd-year Master students in Human Medicine."
  }
};

// Serviços reformulados conforme solicitado
export const DEFAULT_SERVICES = [
  { iconType: "Stethoscope", title: { fr: "Médecine de Famille & Urgence", en: "Family & Emergency Med" }, description: { fr: "Suivi global, continu et prise en charge des urgences.", en: "Global, continuous care and emergency management." } },
  { iconType: "Globe", title: { fr: "Prévention Voyage & Santé Sexuelle", en: "Travel & Sexual Health" }, description: { fr: "Conseils, vaccinations et dépistage.", en: "Advice, vaccinations, and screening." } },
  { iconType: "BookOpen", title: { fr: "Éducation Thérapeutique", en: "Therapeutic Education" }, description: { fr: "Accompagnement et compréhension des pathologies.", en: "Support and understanding of pathologies." } },
  { iconType: "Activity", title: { fr: "Réseau de Médecine Intégrative", en: "Integrative Med Network" }, description: { fr: "Approche globale alliant médecine conventionnelle et thérapies complémentaires.", en: "Global approach combining conventional and complementary therapies." } },
  { iconType: "Users", title: { fr: "Travail en Réseau", en: "Collaborative Network" }, description: { fr: "Collaboration avec les HUG, cliniques privées et médecines alternatives.", en: "Collaboration with HUG, private clinics, and alternative medicines." } },
  { iconType: "Video", title: { fr: "Téléconsultation", en: "Teleconsultation" }, description: { fr: "Consultations médicales à distance sécurisées.", en: "Secure remote medical consultations." } }
];

// Equipamentos reformulados
export const TECHNICAL_PLATFORM = {
  equipment: [
    { fr: "Laboratoire POCT (Prises de sang, urines, frottis, etc.)", en: "POCT Lab (Blood tests, urine, smears, etc.)" },
    { fr: "Échographie POCUS", en: "POCUS Ultrasound" }
  ],
  careRoom: [
    { fr: "ECG", en: "ECG" },
    { fr: "MAPA", en: "ABPM" },
    { fr: "Oximétrie nocturne", en: "Nocturnal Oximetry" },
    { fr: "Perfusios IV (Vitamines / Fer)", en: "IV Infusions (Vitamins / Iron)" },
    { fr: "Traitements chroniques", en: "Chronic treatments" },
    { fr: "Soins de plaies & Sutures", en: "Wound Care & Sutures" },
    { fr: "Vaccinations", en: "Vaccinations" }
  ]
};

export const COMMUNITY_ENGAGEMENTS = ["MedFem", "Onesimus", "FeminEM", "AfCEM"];

// Equipe com Bios e Títulos Exatos Solicitados
export const DEFAULT_DOCTORS = [
  {
    id: "doc1",
    name: "Dr. Eva Niyibizi",
    email: "niyibizi@hin.ch", 
    role: "Ancienne Cheffe de Clinique aux HUG", // Título ajustado
    bookable: true,
    bookingMethod: "onedoc_or_phone",
    oneDocLink: "https://www.onedoc.ch/en/general-practitioner-gp/geneva/pbqre/dr-eva-niyibizi",
    specialty: { fr: "Interniste & Urgentiste", en: "Internist & Emergency Physician" },
    description: { fr: "10 ans d'expérience (HUG, Clinique La Colline, Jérusalem). Médécin consultante aux urgences des HUG.", en: "10 years exp (HUG, Clinique La Colline, Jerusalem). Consultant doctor at HUG emergencies." },
    biography: {
      fr: "Ancienne Cheffe de Clinique aux HUG et actuellement Médecin Consultante aux urgences des HUG. La Dre Eva Niyibizi possède une double spécialité d'Interniste et Urgentiste avec 10 ans d'expérience acquise aux Hôpitaux Universitaires de Genève (HUG), à la Clinique La Colline et à Jérusalem (Israël). Engagée dans sa communauté, elle est membre active de MedFem, Onesimus, FeminEM et AfCEM. Elle collabore étroitement avec le réseau de soins MEDIX.",
      en: "Former Head of Clinic at HUG and currently Consultant Doctor at HUG emergencies. Dr. Eva Niyibizi holds a dual specialty as an Internist and Emergency Physician with 10 years of experience gained at Geneva University Hospitals (HUG), Clinique La Colline, and Jerusalem (Israel). Deeply committed to the community, she is an active member of MedFem, Onesimus, FeminEM, and AfCEM. She collaborates closely with the MEDIX care network."
    },
    languages: ["Français", "English", "Hebrew", "Kinyarwanda"],
    image: IMAGES.drEva
  },
  {
    id: "team1",
    name: "Karen Brechbühl",
    email: "niyibizi@hin.ch", // E-mail unificado
    role: "Médecin", // Alterado conforme solicitado
    bookable: true,
    bookingMethod: "phone_only",
    specialty: { fr: "Médecine Interne", en: "Internal Medicine" },
    description: { fr: "3ème année de résidanat (formation post-graduée).", en: "3rd year resident (post-graduate training)." },
    biography: {
      fr: "Médecin en formation postgraduée en troisième année de médecine interne, je vous accueille en consultation avec écoute attentive, bienveillance et engagement. Titulaire d’une formation médicale réalisée à l’étranger, j’évolue dans un environnement multiculturel et multilingue. Je parle couramment le français, l’anglais et le portugais, avec de bonnes connaissances en roumain.",
      en: "A doctor in postgraduate training in my third year of internal medicine, I welcome you in consultation with attentive listening, kindness, and commitment. Holding a medical degree obtained abroad, I thrive in a multicultural and multilingual environment. I fluently speak French, English, and Portuguese, with good knowledge of Romanian."
    },
    languages: ["Français", "English", "Português", "Română"],
    image: IMAGES.karen
  },
  {
    id: "team2",
    name: "Lucienne Foyeme",
    email: "niyibizi@hin.ch", // E-mail unificado
    role: "Assistante Médicale",
    bookable: false, 
    specialty: { fr: "Administration & Soins", en: "Administration & Care" },
    description: { fr: "Le cœur battant du cabinet avec une gestion humaine et rigoureuse.", en: "The beating heart of the clinic with humane and rigorous management." },
    biography: {
      fr: "Assistante médicale dévouée avec une riche expérience dans la gestion et l'accompagnement des patients. Véritable pilier du cabinet, Lucienne assure le bon déroulement des consultations et la réalisation des examens techniques (prises de sang, ECG, etc.) avec douceur et professionnalisme. Son approche humaine et sa rigueur garantissent un accueil chaleureux et sécurisant pour chaque personne franchissant les portes du cabinet.",
      en: "A dedicated medical assistant with rich experience in patient management and support. A true pillar of the practice, Lucienne ensures the smooth running of consultations and technical exams (blood tests, ECGs, etc.) with gentleness and professionalism. Her human approach and rigor guarantee a warm and secure welcome for everyone walking through the clinic doors."
    },
    languages: ["Français", "English"], 
    image: IMAGES.lucienne
  }
];

export const DEFAULT_CLINIC_INFO = {
  description: {
    fr: "Situé au cœur de Genève, notre cabinet offre un espace moderne dédié à la médecine de famille, l'enseignement et l'inclusion.",
    en: "Located in the heart of Geneva, our practice offers a modern space dedicated to family medicine, teaching, and inclusion."
  },
  address: "Quai du Seujet 14, 1201 Genève",
  phone: "+41 22 700 70 70",
  email: "niyibizi@hin.ch", // E-mail unificado
  mapEmbedUrl: "https://maps.google.com/maps?q=Quai+du+Seujet+14,+1201+Genève&t=&z=15&ie=UTF8&iwloc=&output=embed",
  openingHours: "Lun-Ven: 08:00 - 18:00",
  emergencyInfo: "En cas d'urgence vitale, composez le 144.",
  policies: "Annulation 24h à l'avance.",
  features: [
    // Texto oficial de não discriminação substitui os badges antigos
    { fr: "Toute personne est soignée sans discrimination d'ethnie, de sexe, de religion, d'orientation sexuelle, etc.", en: "Every person is treated without discrimination based on ethnicity, gender, religion, sexual orientation, etc." }
  ]
};

export const TESTIMONIALS = [
  { name: "Natalia Matveeva", text: { fr: "La Dre Niyibizi est extrêmement professionnelle, expérimentée, empathique.", en: "Dr. Niyibizi is extremely professional, experienced, empathetic." }, rating: 5 },
  { name: "Noémie H", text: { fr: "Une médecin absolument remarquable. Compétente, très proactive.", en: "An absolutely remarkable doctor. Competent, very proactive." }, rating: 5 },
  { name: "Laura Spendolini", text: { fr: "Médecin très professionnelle, à l'écoute de ses patients.", en: "Very professional doctor, attentive to her patients." }, rating: 5 },
  { name: "Flurin Ryffel", text: { fr: "Extrêmement compétente et professionnelle.", en: "Extremely competent and professional." }, rating: 5 },
  { name: "Nicolas Blanchet", text: { fr: "Attentive, minutieuse et professionnelle.", en: "Attentive, thorough, and professional." }, rating: 5 }
];

export const PRIVACY_POLICY_TEXT = `POLITIQUE DE CONFIDENTIALITÉ / PRIVACY POLICY\n1. DONNÉES: Nous collectons les données nécessaires à la gestion.\n2. SÉCURITÉ: Vos données sensibles sont stockées de manière cryptée.`;