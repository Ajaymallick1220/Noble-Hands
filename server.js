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
  acceptedEventsCount: { type: Number, default: 0 }, // Optional: Track the count of accepted events
  acceptedEvents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }], // Referencing Event model
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

app.post('/api/accept-event', async (req, res) => {
  const { userId, eventId } = req.query;

  if (!userId || !eventId) {
    return res.status(400).json({ error: 'Missing userId or eventId in query parameters.' });
  }

  try {
    // Find the event by ID
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    // Check if the user is already accepted
    if (event.volunteersAccepted.includes(userId)) {
      return res.status(400).json({ error: 'You have already accepted this event.' });
    }

    // Check if the event is fully booked (volunteersRequired is 0 or less)
    if (event.volunteersRequired <= 0) {
      return res.status(400).json({ error: 'Event is fully booked, no available spots.' });
    }

    // Check if there are available spots
    if (event.volunteersRequired > 0) {
      event.volunteersRequired--; // Decrease the number of available spots
      event.volunteersAccepted.push(userId); // Add the user to the accepted volunteers
      await event.save();

      // Find the user by ID
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      // Add the event to the user's accepted events
      user.acceptedEvents.push(event._id);
      await user.save();

      // Respond with success and event details
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
        updatedAcceptedEvents: user.acceptedEvents, // Optional, for additional reference
      });
    } else {
      // If volunteersRequired is 0 or less, the event is fully booked
      res.status(400).json({ error: 'No volunteer spots available for this event.' });
    }
  } catch (error) {
    // Handle unexpected errors
    console.error('Error accepting event:', error.message);
    res.status(500).json({ error: 'Error accepting event.' });
  }
});

// Reject an event
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

    // Validate inputs
    if (!contact || !username || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ contact });
    if (existingUser) {
      return res.status(400).json({ message: 'Contact is already registered.' });
    }

    // Save new user
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

    // Validate inputs
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    // Check user credentials
    const user = await User.findOne({ username });
    if (!user || user.password !== password) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    // Send user ID (userTD) as part of the login success response
    res.status(200).json({ message: 'Login successful!', userId: user._id });  // Send userId as response
  } catch (error) {
    console.error('Error in /login endpoint:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// Create Event Endpoint
app.post('/events', async (req, res) => {
  try {
    const { name, location, date, time, description, volunteersRequired, workType, eventType } = req.body;

    // Validate inputs
    if (!name || !location || !date || !time || !description || !volunteersRequired || !workType || !eventType) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    // Create and save event
    const newEvent = new Event({ name, location, date, time, description, volunteersRequired, workType, eventType });
    await newEvent.save();
    res.status(201).json({ message: 'Event created successfully!', event: newEvent });
  } catch (error) {
    console.error('Error in /events endpoint:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// Get the top 4 most recent events
app.get('/recent-events', async (req, res) => {
  try {
    const events = await Event.find().sort({ date: -1 }).limit(4); // Sort by date in descending order and limit to 4
    res.status(200).json(events);
  } catch (error) {
    console.error('Error fetching recent events:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});
app.post('/events/:id/accept', async (req, res) => {
  try {
    const { userId } = req.body;
    const event = await Event.findById(req.params.id);

    if (!event || event.volunteersRequired <= 0) {
      return res.status(400).json({ message: 'Event not available or full.' });
    }

    event.volunteersRequired -= 1;
    event.volunteersAccepted.push(userId); // Add the user to volunteersAccepted
    
    // Increment the accepted events count for the user
    await User.findByIdAndUpdate(userId, { $inc: { acceptedEventsCount: 1 } });

    await event.save();

    res.status(200).json({ message: 'Event accepted successfully.', event });
  } catch (error) {
    console.error('Error accepting event:', error);
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
