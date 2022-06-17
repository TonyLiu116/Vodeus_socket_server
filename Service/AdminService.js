import { API_URL } from "../config.js";
import fetch from "node-fetch";

class AdminService {
    addSession(data) {
        fetch( `${API_URL}/${'session'}`, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' }
        }).then(res=>{

        });
    }
}
export default new AdminService();