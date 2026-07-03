import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

class EB extends React.Component {
  constructor(p) { super(p); this.state = { e: null } }
  static getDerivedStateFromError(e) { return { e } }
  render() {
    if (this.state.e)
      return <div style={{ color: 'var(--txt-2)', padding: 40, fontSize: 14 }}>
        Something went wrong rendering this view. <span style={{ color: '#ff6b6b' }}>{this.state.e.message}</span>
      </div>
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <EB><App /></EB>
)
