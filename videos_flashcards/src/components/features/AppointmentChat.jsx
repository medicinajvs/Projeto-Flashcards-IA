import React, { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../config/firebase';

const AppointmentChat = ({ appointmentId, currentUser, isDoctor }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // PROTEÇÃO 1: Se não tem usuário ou ID de agendamento, não conecta no banco
    if (!currentUser || !appointmentId) return;

    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'conversations', appointmentId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    
    // PROTEÇÃO 2: Callback de erro adicionado
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
       console.error("Erro ao carregar chat (permissão ou conexão):", error.message);
    });

    return () => unsubscribe();
  }, [appointmentId, currentUser]); // Recria se o usuário ou agendamento mudar

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'conversations', appointmentId, 'messages'), {
        text: newMessage,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || (isDoctor ? "Médecin" : "Patient"),
        createdAt: serverTimestamp(),
        isDoctorMessage: isDoctor
      });
      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Erro ao enviar mensagem. Verifique sua conexão.");
    }
  };

  return (
    <div className="flex flex-col h-[300px] bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-sm italic mt-10">Début de la conversation...</p>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUser.uid;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-3 rounded-lg text-sm ${isMe ? 'bg-[#008080] text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none shadow-sm'}`}>
                <p className="font-bold text-xs opacity-75 mb-1">{msg.senderName}</p>
                <p>{msg.text}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-200 flex gap-2">
        <input 
          type="text" 
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Écrire un message..."
          className="flex-1 p-2 border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#008080] bg-white text-gray-900"
        />
        <button type="submit" className="p-2 bg-[#008080] text-white rounded-full hover:bg-[#006666] transition">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};

export default AppointmentChat;