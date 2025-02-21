const express = require('express');
const app = express();

const PORT = process.env.PORT || 8080;

// Define a simple GET route
app.get('/api/test', (req, res) => {
  res.send('Working correct');
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
