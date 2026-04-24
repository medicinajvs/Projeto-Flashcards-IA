import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

export const useAppointments = (user, isDoctor, authInitialized) => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Se não tiver usuário logado, zera tudo
    if (!authInitialized || !user) {
      setAppointments([]);
      setLoading(false);
      return;
    }

    try {
      // CAMINHO SIMPLIFICADO: Coleção 'appointments' na raiz
      const appointmentsRef = collection(db, 'appointments');

      const q = query(
        appointmentsRef,
        where('userId', '==', user.uid)
      );

      // Escuta em tempo real
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const results = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Ordena por data (mais recente primeiro) via Javascript
        results.sort((a, b) => {
            // Tenta usar o timestamp do servidor, senão usa a string de data
            const dateA = a.createdAt ? a.createdAt.toDate() : new Date(a.date);
            const dateB = b.createdAt ? b.createdAt.toDate() : new Date(b.date);
            return dateB - dateA;
        });

        setAppointments(results);
        setLoading(false);
      }, (error) => {
        console.error("Erro ao buscar histórico:", error);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err) {
      console.error("Erro no hook useAppointments:", err);
      setLoading(false);
    }
  }, [user, authInitialized]);

  return { appointments, loading };
};