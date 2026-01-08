import ReactDOM from "react-dom/client";
import "@fontsource/anek-latin/600.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "./styles.css";
import App from "./renderer/App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <>
    <App />
  </>
);
