# Nexus Link 🔒⚡

> **Cross-device real-time encrypted messaging and chunked file sharing web application featuring a cyberpunk UI theme.**

![Node.js](https://img.shields.io/badge/Node.js-v18+-green?style=flat-square&logo=node.js)
![Socket.io](https://img.shields.io/badge/Socket.io-v4.7-black?style=flat-square&logo=socket.io)
![Express](https://img.shields.io/badge/Express.js-v4.18-blue?style=flat-square&logo=express)
![PWA](https://img.shields.io/badge/PWA-Ready-purple?style=flat-square&logo=pwa)
![License](https://img.shields.io/badge/License-MIT-brightgreen?style=flat-square)

---

## 🌟 Overview

**Nexus Link** is a lightweight, high-performance web application that enables instant cross-device communication and large file sharing without requiring account registration or third-party cloud storage. 

By utilizing **WebSockets (Socket.io)** and **chunked stream processing**, devices can pair in real-time via room codes and stream files up to **1GB** directly across devices.

---

## 🚀 Live Demo
  [Try it here] https://nexus-link-p192.onrender.com 

  First load may take ~30s if the server was idle (free tier) — thanks for your patience

## ✨ Key Features

- 🔑 **Instant Room Pairing**: Connect mobile devices, laptops, and tablets using temporary room IDs.
- ⚡ **Real-Time Messaging**: Bi-directional low-latency text communication via Socket.io.
- 📁 **High-Speed Chunked File Transfers**: Supports large file uploads (up to 1GB) using stream buffering and `Multer`.
- 📱 **Progressive Web App (PWA)**: Fully responsive cyberpunk-themed UI installable natively on iOS and Android devices with offline Service Worker support.
- 🔒 **Zero Data Persistence**: Rooms and transient data expire automatically, protecting user privacy.

---

## 🛠️ System Architecture & Tech Stack

         +-----------------------------------------+
       |           Nexus Link Client             |
       |     (PWA / Vanilla JS / WebSockets)     |
       +-----------------------------------------+
                            |
               WebSocket / HTTP Stream
                            |
                            v
       +-----------------------------------------+
       |           Node.js & Express             |
       |  (Socket.io Gateway & Stream Handler)   |
       +-----------------------------------------+



## 🚀 Quick Start Guide
### Prerequisites
Make sure you have **Node.js** (v14 or higher) and **npm** installed on your system.
### Installation
1. **Clone the Repository:**
   ```bash
   git clone https://github.com/wolfbyte0/PEER-TO-PEER.git
   cd PEER-TO-PEER



   Install Dependencies:
   bash
   npm install

   Start the Development Server:
   bash
   npm start
   
   Access the Application: Open your browser and navigate to:
   http://localhost:3000


<img width="1365" height="767" alt="image" src="https://github.com/user-attachments/assets/fca668c2-a5bf-4c7e-9ec2-e388bbd8e340" />
