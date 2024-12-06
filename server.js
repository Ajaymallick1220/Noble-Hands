const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// Initialize app
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());
app.use(cors({
  origin: 'https://noble-hands.vercel.app', // Replace with your frontend URL
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));
// MongoDB Connection
const mongoURI = "mongodb+srv://abhaymallick2004:8421822204@cluster0.69cgq.mongodb.net/nobleHands?retryWrites=true&w=majority";

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.log('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  contact: { type: String, required: true },
  username: { type: String, required: true },
  password: { type: String, required: true },
  acceptedEventsCount: { type: Number, default: 0 },
  acceptedEvents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }],
});

// User Model
const User = mongoose.model('User', userSchema);

// Event Schema
const eventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  description: { type: String, required: true },
  volunteersRequired: { type: Number, required: true },
  workType: { type: String, required: true },
  eventType: { type: String, required: true },
  volunteersAccepted: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
});

// Event Model
const Event = mongoose.model('Event', eventSchema);

// Route to serve the dashboard
app.get('/dashboard', async (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Fetch dashboard data
app.get('/api/dashboard-data', async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({ message: 'Missing userId in query parameters.' });
    }

    console.log('API /api/dashboard-data called with userId:', userId);

    const user = await User.findById(userId).populate('acceptedEvents');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const upcomingEvents = await Event.find({ date: { $gte: new Date() } }).populate('volunteersAccepted');

    res.json({
      username: user.username,
      acceptedEvents: user.acceptedEvents || [],
      events: upcomingEvents || [],
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error.message);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// Accept event endpoint
app.post('/api/accept-event', async (req, res) => {
  const { userId, eventId } = req.query;

  if (!userId || !eventId) {
    return res.status(400).json({ error: 'Missing userId or eventId in query parameters.' });
  }

  try {
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    if (event.volunteersAccepted.includes(userId)) {
      return res.status(400).json({ error: 'You have already accepted this event.' });
    }

    if (event.volunteersRequired <= 0) {
      return res.status(400).json({ error: 'Event is fully booked, no available spots.' });
    }

    if (event.volunteersRequired > 0) {
      event.volunteersRequired--;
      event.volunteersAccepted.push(userId);
      await event.save();

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      user.acceptedEvents.push(event._id);
      await user.save();

      res.json({
        success: true,
        event: {
          _id: event._id,
          name: event.name,
          description: event.description,
          location: event.location,
          date: event.date,
          time: event.time,
        },
        updatedAcceptedEvents: user.acceptedEvents,
      });
    } else {
      res.status(400).json({ error: 'No volunteer spots available for this event.' });
    }
  } catch (error) {
    console.error('Error accepting event:', error.message);
    res.status(500).json({ error: 'Error accepting event.' });
  }
});

// Reject event endpoint
app.post('/api/reject-event', async (req, res) => {
  const { userId, eventId } = req.query;

  if (!userId || !eventId) {
    return res.status(400).json({ error: 'Missing userId or eventId in query parameters.' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    user.acceptedEvents.pull(event._id);
    event.volunteersAccepted.pull(userId);

    await user.save();
    await event.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Error rejecting event:', error.message);
    res.status(500).json({ error: 'Error rejecting event.' });
  }
});

// Register Endpoint
app.post('/register', async (req, res) => {
  try {
    console.log(req.body); // Log incoming data for debugging
    const { contact, username, password } = req.body;

    if (!contact || !username || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const existingUser = await User.findOne({ contact });
    if (existingUser) {
      return res.status(400).json({ message: 'Contact is already registered.' });
    }

    const newUser = new User({ contact, username, password });
    await newUser.save();
    res.status(201).json({ message: 'Registration successful!' });
  } catch (error) {
    console.error('Error in /register endpoint:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// Login Endpoint
app.post('/login', async (req, res) => {
  try {
    console.log(req.body); // Log incoming data for debugging
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const user = await User.findOne({ username });
    if (!user || user.password !== password) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    res.status(200).json({ message: 'Login successful!', userId: user._id });
  } catch (error) {
    console.error('Error in /login endpoint:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// Serve static files from the root directory
app.use(express.static(__dirname));

// Serve register.html and login.html on specific routes
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/event', (req, res) => {
  res.sendFile(path.join(__dirname, 'event.html'));
});

// Vercel URL
const vercelUrl = 'https://noble-hands-ajaymallick1220-ajaymallick1220s-projects.vercel.app/';

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running at ${vercelUrl}`);
});
