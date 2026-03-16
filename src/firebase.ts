
// Mock Firebase using localStorage
const STORAGE_KEY_PREFIX = 'desknet_mock_';

const getStorageData = (collectionName: string) => {
  const data = localStorage.getItem(STORAGE_KEY_PREFIX + collectionName);
  return data ? JSON.parse(data) : [];
};

const setStorageData = (collectionName: string, data: any[]) => {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + collectionName, JSON.stringify(data));
    // Trigger storage event for onSnapshot
    window.dispatchEvent(new CustomEvent(`storage_update_${collectionName}`, { detail: data }));
  } catch (e: any) {
    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      console.error(`LocalStorage quota exceeded for collection: ${collectionName}.`);
      // In a real app we might prune, but here we'll just throw a clearer error
      throw new Error('Storage quota exceeded. Please remove some attachments or clear browser data.');
    }
    throw e;
  }
};

// Auth Mock
let currentUser: any = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFIX + 'current_user') || 'null');

const listeners: ((user: any) => void)[] = [];

export const auth = {
  get currentUser() {
    return currentUser;
  }
};

export const onAuthStateChanged = (authObj: any, callback: (user: any) => void) => {
  listeners.push(callback);
  callback(currentUser);
  return () => {
    const index = listeners.indexOf(callback);
    if (index > -1) listeners.splice(index, 1);
  };
};

export const signInWithEmailAndPassword = async (authObj: any, email: string, pass: string) => {
  const users = getStorageData('users');
  const user = users.find((u: any) => u.email === email);
  
  if (!user) throw new Error('auth/user-not-found');
  // In a real mock we'd check password, but for simplicity:
  currentUser = { ...user, uid: user.uid || user.id };
  localStorage.setItem(STORAGE_KEY_PREFIX + 'current_user', JSON.stringify(currentUser));
  listeners.forEach(cb => cb(currentUser));
  return { user: currentUser };
};

export const createUserWithEmailAndPassword = async (authObj: any, email: string, pass: string) => {
  const users = getStorageData('users');
  if (users.find((u: any) => u.email === email)) throw new Error('auth/email-already-in-use');
  
  const newUser = {
    uid: 'user_' + Math.random().toString(36).substr(2, 9),
    email,
    role: 'client', // default
    createdAt: new Date().toISOString()
  };
  
  users.push(newUser);
  setStorageData('users', users);
  
  currentUser = newUser;
  localStorage.setItem(STORAGE_KEY_PREFIX + 'current_user', JSON.stringify(currentUser));
  listeners.forEach(cb => cb(currentUser));
  return { user: currentUser };
};

export const signOut = async (authObj?: any) => {
  currentUser = null;
  localStorage.removeItem(STORAGE_KEY_PREFIX + 'current_user');
  listeners.forEach(cb => cb(null));
};

// Firestore Mock
export const db = {};

export const collection = (dbObj: any, name: string) => ({ type: 'collection', name });
export const doc = (dbObj: any, name?: string, id?: string) => {
  if (typeof dbObj === 'object' && dbObj.type === 'collection') {
    return { 
      type: 'doc', 
      collection: dbObj.name, 
      id: name || Math.random().toString(36).substr(2, 9) 
    };
  }
  return { type: 'doc', collection: name, id };
};

export const query = (colRef: any, ...constraints: any[]) => {
  return { ...colRef, constraints };
};

export const where = (field: string, op: string, value: any) => ({ type: 'where', field, op, value });
export const orderBy = (field: string, dir: string = 'asc') => ({ type: 'orderBy', field, dir });
export const limit = (n: number) => ({ type: 'limit', n });

export const getDocs = async (queryRef: any) => {
  let data = getStorageData(queryRef.name || queryRef.collection);
  
  if (queryRef.constraints) {
    queryRef.constraints.forEach((c: any) => {
      if (c.type === 'where') {
        data = data.filter((item: any) => {
          if (c.op === '==') return item[c.field] === c.value;
          if (c.op === 'array-contains') return Array.isArray(item[c.field]) && item[c.field].includes(c.value);
          return true;
        });
      }
      if (c.type === 'orderBy') {
        data.sort((a: any, b: any) => {
          const valA = a[c.field];
          const valB = b[c.field];
          if (valA === valB) return 0;
          if (c.dir === 'asc') return valA > valB ? 1 : -1;
          return valA < valB ? 1 : -1;
        });
      }
    });
  }
  
  const docs = data.map((d: any) => ({
    id: d.id || d.uid,
    data: () => d
  }));

  return {
    docs,
    size: data.length,
    forEach: (cb: any) => docs.forEach(cb),
    docChanges: () => docs.map(doc => ({
      type: 'added',
      doc
    }))
  };
};

export const getDoc = async (docRef: any) => {
  const data = getStorageData(docRef.collection);
  const item = data.find((d: any) => (d.id || d.uid) === docRef.id);
  return {
    exists: () => !!item,
    data: () => item,
    id: docRef.id
  };
};

export const addDoc = async (colRef: any, data: any) => {
  const collectionData = getStorageData(colRef.name);
  const processedData = { ...data };
  
  // Handle serverTimestamp for any field
  Object.keys(processedData).forEach(key => {
    if (processedData[key] === 'serverTimestamp') {
      processedData[key] = new Date().toISOString();
    }
  });

  const newDoc = { 
    ...processedData, 
    id: Math.random().toString(36).substr(2, 9)
  };
  collectionData.push(newDoc);
  setStorageData(colRef.name, collectionData);
  return { id: newDoc.id };
};

export const setDoc = async (docRef: any, data: any, options?: any) => {
  const collectionData = getStorageData(docRef.collection);
  const index = collectionData.findIndex((d: any) => (d.id || d.uid) === docRef.id);
  
  let newData = { ...data };
  // Handle serverTimestamp for any field
  Object.keys(newData).forEach(key => {
    if (newData[key] === 'serverTimestamp') {
      newData[key] = new Date().toISOString();
    }
  });

  if (index > -1) {
    if (options?.merge) {
      collectionData[index] = { ...collectionData[index], ...newData };
    } else {
      collectionData[index] = { ...newData, id: docRef.id };
    }
  } else {
    collectionData.push({ ...newData, id: docRef.id });
  }
  
  setStorageData(docRef.collection, collectionData);
};

export const updateDoc = async (docRef: any, data: any) => {
  const collectionData = getStorageData(docRef.collection);
  const index = collectionData.findIndex((d: any) => (d.id || d.uid) === docRef.id);
  
  if (index > -1) {
    const newData = { ...data };
    // Handle serverTimestamp for any field
    Object.keys(newData).forEach(key => {
      if (newData[key] === 'serverTimestamp') {
        newData[key] = new Date().toISOString();
      }
    });

    collectionData[index] = { ...collectionData[index], ...newData };
    setStorageData(docRef.collection, collectionData);
  }
};

export const deleteDoc = async (docRef: any) => {
  const collectionData = getStorageData(docRef.collection);
  const filtered = collectionData.filter((d: any) => (d.id || d.uid) !== docRef.id);
  setStorageData(docRef.collection, filtered);
};

export const onSnapshot = (queryRef: any, callback: any, errorCallback?: any) => {
  const collectionName = queryRef.name || queryRef.collection;
  
  const handler = async () => {
    try {
      const snapshot = await getDocs(queryRef);
      callback(snapshot);
    } catch (err) {
      if (errorCallback) errorCallback(err);
    }
  };

  window.addEventListener(`storage_update_${collectionName}`, handler);
  handler(); // Initial call

  return () => window.removeEventListener(`storage_update_${collectionName}`, handler);
};

export const serverTimestamp = () => 'serverTimestamp';

export const firebaseConfig = {
  apiKey: 'mock-api-key',
  authDomain: 'mock-auth-domain',
  projectId: 'mock-project-id',
  storageBucket: 'mock-storage-bucket',
  messagingSenderId: 'mock-sender-id',
  appId: 'mock-app-id'
};
export const isFirebaseConfigured = true;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.error('Mock Storage Error: ', error, operationType, path);
}

// Initialize some default data if empty
if (getStorageData('users').length === 0) {
  setStorageData('users', [
    {
      uid: 'admin_desknet',
      email: 'logistmate@gmail.com',
      displayName: 'Admin',
      role: 'admin',
      status: 'Active',
      createdAt: new Date().toISOString()
    },
    {
      uid: 'client_1',
      email: 'client@example.com',
      displayName: 'Example Client',
      role: 'client',
      status: 'Active',
      createdAt: new Date().toISOString()
    }
  ]);
}

if (getStorageData('tickets').length === 0) {
  setStorageData('tickets', [
    {
      id: 'ticket_1',
      subject: 'Network Connectivity Issue',
      description: 'The office network is down in the main hall.',
      status: 'In Progress',
      priority: 'High',
      clientEmail: 'client@example.com',
      clientName: 'Example Client',
      createdAt: new Date().toISOString(),
      serviceType: 'On-Demand Dispatch'
    },
    {
      id: 'ticket_2',
      subject: 'Server Maintenance',
      description: 'Scheduled maintenance for the database server.',
      status: 'Pending',
      priority: 'Medium',
      clientEmail: 'client@example.com',
      clientName: 'Example Client',
      createdAt: new Date().toISOString(),
      serviceType: 'Maintenance'
    }
  ]);
}

export default { auth, db };
