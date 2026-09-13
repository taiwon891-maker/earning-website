// Register Route (Name, Gmail, Password)
app.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).send('Email already registered! <a href="/login">Login here</a>');
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save New User
    await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword
    });

    res.send('Registration Successful! <a href="/login">Click here to Login</a>');
  } catch (err) {
    res.status(500).send('Error registering user');
  }
});

// Login Route (Gmail, Password)
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('token', token, { httpOnly: true }).redirect('/');
    } else {
      res.status(400).send('Invalid Gmail or Password! <a href="/login">Try again</a>');
    }
  } catch (err) {
    res.status(500).send('Login error');
  }
});
