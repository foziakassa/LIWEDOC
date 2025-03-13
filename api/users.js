// api/users.js
export default function handler(req, res) {
    if (req.method === 'GET') {
      // Handle GET request for users
      res.status(200).json({ message: 'List of users' });
    } else if (req.method === 'POST') {
      // Handle POST request to create a user
      res.status(201).json({ message: 'User  created' });
    } else {
      // Handle any other HTTP method
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  }