import { store } from './db/store'
import { SessionHome } from './features/session/SessionHome'

export default function App() {
  return <SessionHome store={store} />
}
