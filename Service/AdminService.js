import { API_URL, BIRD_URL } from "../config.js";
import fetch from "node-fetch";

class AdminService {
    addSession(data) {
        fetch(`${API_URL}/${'session'}`, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' }
        }).then(res => {

        });
    }

    deleteBirdRoom(roomId) {
        fetch(`${BIRD_URL}/${roomId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json; charset=utf8', 'Api-Token': '583c7da377adf4b117fa59e20107374b50f5b557' }
        }).then(res => {
        });
    }
}
export default new AdminService();