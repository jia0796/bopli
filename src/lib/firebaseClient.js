import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, collection, query, where, onSnapshot, connectFirestoreEmulator, getDocsFromServer } from 'firebase/firestore';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';

let instance;
export function firebaseClient(env=import.meta.env) {
  if(instance)return instance;
  const config={apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,appId:env.VITE_FIREBASE_APP_ID};
  if(Object.values(config).some(v=>!v))throw new Error('尚未設定 Firebase，請完成連線設定');
  const app=initializeApp(config);
  const auth=getAuth(app);
  // Memory cache only. No offline queued accounting writes exist in this client.
  const db=initializeFirestore(app,{localCache:memoryLocalCache()});
  const functions=getFunctions(app,env.VITE_FIREBASE_FUNCTIONS_REGION||'asia-east1');
  if(env.VITE_FIREBASE_EMULATORS==='true') {
    if(!['localhost','127.0.0.1'].includes(location.hostname)||!config.projectId.startsWith('demo-'))throw new Error('模擬器僅限本機 demo project');
    connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
    connectFirestoreEmulator(db,'127.0.0.1',8080);
    connectFunctionsEmulator(functions,'127.0.0.1',5001);
  }
  instance={
    async login() {await auth.authStateReady();if(!auth.currentUser)await signInAnonymously(auth);return auth.currentUser;},
    async call(name,data={}) {return (await httpsCallable(functions,name,{timeout:12000})(data)).data;},
    watch(uid,onGroups,onError) {
      return onSnapshot(query(collection(db,'groups'),where('readerAuthUids','array-contains',uid)),{includeMetadataChanges:true},snapshot=>{
        // Cache events never authorize entry or unblock a disconnected client.
        if(!snapshot.metadata.fromCache)onGroups(snapshot.docs.map(d=>({id:d.id,epoch:d.data().epoch})));
      },onError);
    },
    async groups(uid) {return (await getDocsFromServer(query(collection(db,'groups'),where('readerAuthUids','array-contains',uid)))).docs.map(d=>({id:d.id,epoch:d.data().epoch}));},
  };
  return instance;
}
