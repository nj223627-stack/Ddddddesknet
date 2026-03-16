import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db, collection, query, where, onSnapshot, orderBy, limit } from '../firebase';
import { AnimatePresence, motion } from 'framer-motion';
import { HiBell as Bell, HiChatBubbleLeftRight as MessageSquare, HiTicket as Ticket, HiXMark as X } from 'react-icons/hi2';

interface Notification {
  id: string;
  type: 'message' | 'ticket' | 'system' | 'success' | 'error';
  title: string;
  message: string;
  timestamp: any;
  link?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode, currentUser: any }> = ({ children, currentUser }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((notif: Omit<Notification, 'id' | 'timestamp'>) => {
    const id = Math.random().toString(36).substring(7);
    const newNotif = { ...notif, id, timestamp: new Date() };
    setNotifications(prev => [newNotif, ...prev].slice(0, 5)); // Keep only last 5

    // Auto-remove after 5 seconds
    setTimeout(() => {
      removeNotification(id);
    }, 5000);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Listen for new messages
  useEffect(() => {
    if (!currentUser?.uid) return;

    const q = query(
      collection(db, "messages"),
      where("receiverId", "==", currentUser.uid),
      where("unread", "==", true),
      orderBy("timestamp", "desc"),
      limit(1)
    );

    let isInitialLoad = true;
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (isInitialLoad) {
        isInitialLoad = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type === "modified") {
          const data = change.doc.data();
          addNotification({
            type: 'message',
            title: 'New Message',
            message: `${data.senderName}: ${data.content.substring(0, 50)}${data.content.length > 50 ? '...' : ''}`,
          });
        }
      });
    }, (error) => {
      console.error("Notification message listener error:", error);
    });

    return () => unsubscribe();
  }, [currentUser?.uid, addNotification]);

  // Listen for ticket updates (for clients and engineers)
  useEffect(() => {
    if (!currentUser?.uid) return;

    const q = query(
      collection(db, "tickets"),
      where(currentUser.role === 'client' ? "clientId" : "assignedEngineerId", "==", currentUser.uid),
      orderBy("updatedAt", "desc"),
      limit(1)
    );

    let isInitialLoad = true;
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (isInitialLoad) {
        isInitialLoad = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === "modified" || change.type === "added") {
          const data = change.doc.data();
          addNotification({
            type: 'ticket',
            title: 'Ticket Updated',
            message: `Ticket #${change.doc.id.substring(0, 6)} status changed to ${data.status}`,
          });
        }
      });
    }, (error) => {
      console.error("Notification ticket listener error:", error);
    });

    return () => unsubscribe();
  }, [currentUser?.uid, currentUser?.role, addNotification]);

  useEffect(() => {
    const handleGlobalNotify = (event: any) => {
      if (event.detail) {
        addNotification(event.detail);
      }
    };
    window.addEventListener('desknet-notify', handleGlobalNotify);
    return () => window.removeEventListener('desknet-notify', handleGlobalNotify);
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className="pointer-events-auto w-80 bg-brand-card rounded-2xl shadow-2xl border border-white/10 p-4 flex gap-4 items-start relative overflow-hidden group backdrop-blur-md"
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                notif.type === 'error' ? 'bg-red-500' : 
                notif.type === 'success' ? 'bg-emerald-500' : 
                'bg-brand-teal'
              }`} />
              
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                notif.type === 'message' ? 'bg-blue-500/10 text-blue-400' : 
                notif.type === 'ticket' ? 'bg-emerald-500/10 text-emerald-400' : 
                notif.type === 'error' ? 'bg-red-500/10 text-red-400' :
                notif.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                'bg-white/5 text-white/40'
              }`}>
                {notif.type === 'message' ? <MessageSquare className="w-5 h-5" /> : 
                 notif.type === 'ticket' ? <Ticket className="w-5 h-5" /> : 
                 notif.type === 'error' ? <X className="w-5 h-5" /> :
                 notif.type === 'success' ? <Ticket className="w-5 h-5" /> :
                 <Bell className="w-5 h-5" />}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-white truncate">{notif.title}</h4>
                <p className="text-xs text-white/60 line-clamp-2 mt-0.5">{notif.message}</p>
              </div>

              <button 
                onClick={() => removeNotification(notif.id)}
                className="p-1 hover:bg-white/5 rounded-lg text-white/20 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
};
