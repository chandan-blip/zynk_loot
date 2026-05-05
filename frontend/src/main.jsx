import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
// Patch react-hot-toast so every toast message rewrites legacy Z/Zynk amounts
// into the user's selected currency. Side-effect-only import.
import './utils/toastCurrencyPatch'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
