// TODO: Replace the following with your app's Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDbmGUZnUYxHQaJCUupvUWlOpaJIAQAuM8",
  authDomain: "pengingattugasmu-b7521.firebaseapp.com",
  projectId: "pengingattugasmu-b7521",
  storageBucket: "pengingattugasmu-b7521.firebasestorage.app",
  messagingSenderId: "696837130903",
  appId: "1:696837130903:web:6e4dd2c8fc5765cd4337d2",
  measurementId: "G-H0L37VR6FZ"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
