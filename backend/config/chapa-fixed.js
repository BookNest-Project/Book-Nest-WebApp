import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class ChapaFixed {
  constructor(secretKey) {
    this.secretKey = secretKey;
    this.baseURL = 'https://api.chapa.co/v1';
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  async initialize(paymentData) {
    try {
      const response = await this.client.post('/transaction/initialize', paymentData);
      return response.data;
    } catch (error) {
      console.error('Chapa API Error:', error.response?.data || error.message);
      throw error;
    }
  }

  async verify(transactionRef) {
    try {
      const response = await this.client.get(`/transaction/verify/${transactionRef}`);
      return response.data;
    } catch (error) {
      console.error('Chapa Verification Error:', error.response?.data || error.message);
      throw error;
    }
  }
}

// Create and export instance
const chapaFixed = new ChapaFixed(process.env.CHAPA_SECRET_KEY);

export default chapaFixed;