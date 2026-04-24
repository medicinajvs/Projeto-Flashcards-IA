import { CheckCircle, XCircle, CheckSquare, Eye, Clock } from 'lucide-react';

export const getStatusLabel = (status) => {
  switch (status) {
    case 'confirmed': return { text: 'Confirmé', color: 'bg-green-100 text-green-700', icon: CheckCircle };
    case 'cancelled': return { text: 'Annulé', color: 'bg-red-100 text-red-700', icon: XCircle };
    case 'completed': return { text: 'Terminé', color: 'bg-blue-100 text-blue-700', icon: CheckSquare };
    case 'no_show': return { text: 'Absent', color: 'bg-gray-200 text-gray-700', icon: Eye };
    default: return { text: status, color: 'bg-gray-100 text-gray-700', icon: Clock };
  }
};