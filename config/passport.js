const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const User = require('../models/User');

// JWT Strategy for existing authentication
passport.use(new JwtStrategy({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET || 'your-secret-key'
}, async (payload, done) => {
  try {
    const user = await User.findById(payload.userId).select('-password');
    if (user) {
      return done(null, user);
    }
    return done(null, false);
  } catch (error) {
    return done(error, false);
  }
}));

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback"
  },       async (accessToken, refreshToken, profile, done) => {
        try {
          console.log('Google OAuth Profile:', JSON.stringify(profile, null, 2));
          console.log('Google OAuth Profile Names:', {
            givenName: profile.name?.givenName,
            familyName: profile.name?.familyName,
            displayName: profile.displayName,
            fullName: profile.name?.fullName
          });

    // Check if user already exists with this Google ID
    let existingUser = await User.findOne({ googleId: profile.id });
    
    if (existingUser) {
      return done(null, existingUser);
    }

    // Check if user exists with the same email
    const existingUserByEmail = await User.findOne({ email: profile.emails[0].value });
    
    if (existingUserByEmail) {
      // Link Google account to existing user
      existingUserByEmail.googleId = profile.id;
      existingUserByEmail.provider = 'google';
      
      // Update names if they're missing in the existing account
      if (!existingUserByEmail.firstName || !existingUserByEmail.lastName) {
        let firstName = profile.name?.givenName || '';
        let lastName = profile.name?.familyName || '';
        
        if (!firstName && !lastName && profile.displayName) {
          const nameParts = profile.displayName.trim().split(' ');
          firstName = nameParts[0] || '';
          lastName = nameParts.slice(1).join(' ') || '';
        }
        
        existingUserByEmail.firstName = existingUserByEmail.firstName || firstName.trim() || 'Google';
        existingUserByEmail.lastName = existingUserByEmail.lastName || lastName.trim() || 'User';
      }
      
      await existingUserByEmail.save();
      return done(null, existingUserByEmail);
    }

    // Extract and validate names from Google profile
    let firstName = profile.name?.givenName || '';
    let lastName = profile.name?.familyName || '';
    
    // If names are missing, try to extract from displayName
    if (!firstName && !lastName && profile.displayName) {
      const nameParts = profile.displayName.trim().split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }
    
    // Fallback values if names are still empty
    firstName = firstName.trim() || 'Google';
    lastName = lastName.trim() || 'User';
    
    console.log('Extracted names:', { firstName, lastName });

    // Create new user
    const newUser = new User({
      googleId: profile.id,
      email: profile.emails[0].value,
      firstName: firstName,
      lastName: lastName,
      provider: 'google',
      isEmailVerified: true, // Google emails are pre-verified
      role: 'user'
      // Phone is optional for Google OAuth users
    });

    const savedUser = await newUser.save();
    return done(null, savedUser);
  } catch (error) {
    console.error('Google OAuth Error:', error);
    return done(error, null);
  }
  }));
} else {
  console.log('Google OAuth not configured - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required');
}

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select('-password');
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
