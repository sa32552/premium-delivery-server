require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Connexion MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/premiumdelivery';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connecté à MongoDB Atlas'))
.catch(err => console.error('❌ Erreur MongoDB:', err));

// Modèles (le même code que précédemment)
const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  name: String,
  type: { type: String, enum: ['admin', 'livreur', 'boutique'] },
  boutiqueName: String,
  phone: String,
  address: String,
  createdAt: { type: Date, default: Date.now }
});

const FormulaireSchema = new mongoose.Schema({
  boutiqueId: String,
  boutiqueName: String,
  questions: [{
    question: String,
    reponse: String
  }],
  clientName: String,
  prix: Number,
  heureLivraison: String,
  localisation: String,
  status: { type: String, enum: ['en_attente', 'assigné', 'en_cours', 'livré'], default: 'en_attente' },
  livreurId: String,
  livreurName: String,
  createdAt: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
  from: String,
  to: String,
  fromType: String,
  toType: String,
  content: String,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Formulaire = mongoose.model('Formulaire', FormulaireSchema);
const Message = mongoose.model('Message', MessageSchema);

// ==================== ROUTES (même code que précédemment) ====================

// Test route
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Premium Delivery API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString()
  });
});

// Login route
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Utilisateur non trouvé' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Mot de passe incorrect' });
    }

    const token = jwt.sign({ 
      userId: user._id, 
      type: user.type 
    }, JWT_SECRET);

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        type: user.type,
        boutiqueName: user.boutiqueName
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Register boutique route
app.post('/api/register-boutique', async (req, res) => {
  try {
    const { email, password, name, boutiqueName, phone, address } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({
      email,
      password: hashedPassword,
      name,
      type: 'boutique',
      boutiqueName,
      phone,
      address
    });
    
    await user.save();

    const token = jwt.sign({ 
      userId: user._id, 
      type: user.type 
    }, JWT_SECRET);

    res.json({
      message: 'Boutique inscrite avec succès',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        type: user.type,
        boutiqueName: user.boutiqueName
      }
    });
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ... AJOUTEZ TOUTES LES AUTRES ROUTES ICI ...

// ==================== WEBSOCKET ====================

io.on('connection', (socket) => {
  console.log('🔗 Client connecté:', socket.id);
  
  socket.on('join_user', (userId) => {
    socket.join(userId);
    console.log(`👤 Utilisateur ${userId} rejoint sa room`);
  });
  
  socket.on('send_message', async (data) => {
    try {
      const message = new Message(data);
      await message.save();
      
      io.to(data.to).emit('new_message', message);
      io.to(data.from).emit('message_sent', message);
    } catch (error) {
      console.error('Erreur message:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Client déconnecté:', socket.id);
  });
});

// ==================== DÉMARRAGE SERVEUR ====================

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Serveur Premium Delivery démarré sur le port ${PORT}`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});