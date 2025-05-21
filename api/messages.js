const express = require('express');
const router = express.Router();
const { query } = require('./db');
const { verifyToken } = require('./auth');
const { createNotification } = require('./notifications');

// Get all messages for a swap request
router.get('/swap-request/:swapRequestId', verifyToken, async (req, res) => {
  try {
    const { swapRequestId } = req.params;
    const userId = req.user.id;

    // Get the swap request to check if the user is involved
    const swapRequest = await query(
      `SELECT sr.*, p.user_id as post_owner_id
       FROM swap_requests sr
       JOIN posts p ON sr.post_id = p.id
       WHERE sr.id = $1`,
      [swapRequestId]
    );

    if (swapRequest.rows.length === 0) {
      return res.status(404).json({ error: "Swap request not found" });
    }

    // Check if the user is involved in the swap request
    if (swapRequest.rows[0].requester_id !== userId && swapRequest.rows[0].post_owner_id !== userId) {
      return res.status(403).json({ error: "You are not authorized to view these messages" });
    }

    // Get all messages for the swap request
    const messages = await query(
      `SELECT m.*, 
              u."Firstname" as sender_firstname, u."Lastname" as sender_lastname,
              u."Image" as sender_image
       FROM messages m
       JOIN "user" u ON m.sender_id = u.id
       WHERE m.swap_request_id = $1
       ORDER BY m.created_at ASC`,
      [swapRequestId]
    );

    // Mark messages as read if the user is the receiver
    await query(
      `UPDATE messages
       SET is_read = TRUE
       WHERE swap_request_id = $1 AND receiver_id = $2 AND is_read = FALSE`,
      [swapRequestId, userId]
    );

    res.status(200).json(messages.rows);
  } catch (error) {
    console.error("Error in getMessagesBySwapRequest:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all conversations for a user
router.get('/conversations', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all swap requests where the user is involved
    const swapRequests = await query(
      `SELECT sr.id, sr.post_id, sr.requester_id, sr.status, sr.created_at, sr.updated_at,
              p.title as post_title, p.type as post_type, p.images as post_images,
              p.user_id as post_owner_id,
              po."Firstname" as post_owner_firstname, po."Lastname" as post_owner_lastname,
              po."Image" as post_owner_image,
              r."Firstname" as requester_firstname, r."Lastname" as requester_lastname,
              r."Image" as requester_image,
              (SELECT COUNT(*) FROM messages WHERE swap_request_id = sr.id AND receiver_id = $1 AND is_read = FALSE) as unread_count,
              (SELECT MAX(created_at) FROM messages WHERE swap_request_id = sr.id) as last_message_time,
              (SELECT message FROM messages WHERE swap_request_id = sr.id ORDER BY created_at DESC LIMIT 1) as last_message
       FROM swap_requests sr
       JOIN posts p ON sr.post_id = p.id
       JOIN "user" po ON p.user_id = po.id
       JOIN "user" r ON sr.requester_id = r.id
       WHERE p.user_id = $1 OR sr.requester_id = $1
       ORDER BY last_message_time DESC NULLS LAST, sr.updated_at DESC`,
      [userId]
    );

    // Format the response
    const conversations = swapRequests.rows.map(sr => {
      const isRequester = sr.requester_id === userId;
      const otherPartyId = isRequester ? sr.post_owner_id : sr.requester_id;
      const otherPartyName = isRequester
        ? `${sr.post_owner_firstname} ${sr.post_owner_lastname}`
        : `${sr.requester_firstname} ${sr.requester_lastname}`;
      const otherPartyImage = isRequester ? sr.post_owner_image : sr.requester_image;

      return {
        id: sr.id,
        post_id: sr.post_id,
        post_title: sr.post_title,
        post_type: sr.post_type,
        post_image: sr.post_images && sr.post_images.length > 0 ? sr.post_images[0] : null,
        status: sr.status,
        created_at: sr.created_at,
        updated_at: sr.updated_at,
        last_message_time: sr.last_message_time,
        last_message: sr.last_message,
        unread_count: parseInt(sr.unread_count),
        other_party: {
          id: otherPartyId,
          name: otherPartyName,
          image: otherPartyImage
        },
        is_requester: isRequester
      };
    });

    res.status(200).json(conversations);
  } catch (error) {
    console.error("Error in getUserConversations:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Send a message
router.post('/', verifyToken, async (req, res) => {
  try {
    const { swap_request_id, message, attachments } = req.body;
    const sender_id = req.user.id;

    // Validate required fields
    if (!swap_request_id || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check if the swap request exists
    const swapRequest = await query(
      `SELECT sr.*, p.user_id as post_owner_id, p.title as post_title
       FROM swap_requests sr
       JOIN posts p ON sr.post_id = p.id
       WHERE sr.id = $1`,
      [swap_request_id]
    );

    if (swapRequest.rows.length === 0) {
      return res.status(404).json({ error: "Swap request not found" });
    }

    // Check if the user is involved in the swap request
    if (swapRequest.rows[0].requester_id !== sender_id && swapRequest.rows[0].post_owner_id !== sender_id) {
      return res.status(403).json({ error: "You are not authorized to send messages in this conversation" });
    }

    // Determine the receiver
    const receiver_id = sender_id === swapRequest.rows[0].requester_id
      ? swapRequest.rows[0].post_owner_id
      : swapRequest.rows[0].requester_id;

    // Parse attachments if it's a string
    const parsedAttachments = typeof attachments === 'string'
      ? JSON.parse(attachments)
      : attachments || [];

    // Create the message
    const result = await query(
      `INSERT INTO messages (
        swap_request_id, sender_id, receiver_id, message, attachments, is_read, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *`,
      [swap_request_id, sender_id, receiver_id, message, parsedAttachments, false]
    );

    // Update the swap request's updated_at timestamp
    await query(
      `UPDATE swap_requests
       SET updated_at = NOW()
       WHERE id = $1`,
      [swap_request_id]
    );

    // Get sender info
    const senderInfo = await query(
      `SELECT "Firstname", "Lastname", "Image" FROM "user" WHERE id = $1`,
      [sender_id]
    );

    // Create a notification for the receiver
    const notificationTitle = 'New Message';
    const notificationMessage = `You have received a new message regarding ${swapRequest.rows[0].post_title}`;

    await query(
      `INSERT INTO notifications (
        user_id, type, title, message, related_id, is_read, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        receiver_id,
        'new_message',
        notificationTitle,
        notificationMessage,
        swap_request_id,
        false
      ]
    );

    // Add sender info to the response
    const messageWithSender = {
      ...result.rows[0],
      sender_firstname: senderInfo.rows[0].Firstname,
      sender_lastname: senderInfo.rows[0].Lastname,
      sender_image: senderInfo.rows[0].Image
    };

    res.status(201).json(messageWithSender);
  } catch (error) {
    console.error("Error in sendMessage:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Mark messages as read
router.put('/read', verifyToken, async (req, res) => {
  try {
    const { swap_request_id } = req.body;
    const userId = req.user.id;

    if (!swap_request_id) {
      return res.status(400).json({ error: "Swap request ID is required" });
    }

    // Check if the swap request exists and the user is involved
    const swapRequest = await query(
      `SELECT sr.*, p.user_id as post_owner_id
       FROM swap_requests sr
       JOIN posts p ON sr.post_id = p.id
       WHERE sr.id = $1`,
      [swap_request_id]
    );

    if (swapRequest.rows.length === 0) {
      return res.status(404).json({ error: "Swap request not found" });
    }

    // Check if the user is involved in the swap request
    if (swapRequest.rows[0].requester_id !== userId && swapRequest.rows[0].post_owner_id !== userId) {
      return res.status(403).json({ error: "You are not authorized to mark messages as read in this conversation" });
    }

    // Mark messages as read
    const result = await query(
      `UPDATE messages
       SET is_read = TRUE
       WHERE swap_request_id = $1 AND receiver_id = $2 AND is_read = FALSE
       RETURNING *`,
      [swap_request_id, userId]
    );

    res.status(200).json({
      message: "Messages marked as read",
      count: result.rowCount,
      messages: result.rows
    });
  } catch (error) {
    console.error("Error in markMessagesAsRead:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get unread message count
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      `SELECT COUNT(*) FROM messages
       WHERE receiver_id = $1 AND is_read = FALSE`,
      [userId]
    );

    res.status(200).json({
      count: parseInt(result.rows[0].count)
    });
  } catch (error) {
    console.error("Error in getUnreadMessageCount:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;