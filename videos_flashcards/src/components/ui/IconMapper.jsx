import React from 'react';
import { 
  Stethoscope, 
  Activity, 
  Syringe, 
  Heart, 
  Users, 
  Shield, 
  MapPin, 
  Phone, 
  Mail, 
  Video, 
  Globe, 
  BookOpen, 
  Star, 
  CheckCircle, 
  Monitor,
  Microscope,
  Award
} from 'lucide-react';

const icons = {
  Stethoscope,
  Activity,
  Syringe,
  Heart,
  Users,
  Shield,
  MapPin,
  Phone,
  Mail,
  Video,
  Globe,
  BookOpen,     // Novo: Ensino
  Star,         // Novo: Qualidade
  CheckCircle,  // Novo: Listas
  Monitor,      // Novo: Equipamentos
  Microscope,   // Novo: Laboratório
  Award         // Novo: Formação
};

const IconMapper = ({ type, className }) => {
  const IconComponent = icons[type];
  // Se o ícone não existir, retorna null para não quebrar o site
  if (!IconComponent) return null;
  return <IconComponent className={className} />;
};

export default IconMapper;