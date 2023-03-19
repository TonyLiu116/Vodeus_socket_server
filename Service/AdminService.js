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
            headers: { 'Content-Type': 'application/json; charset=utf8', 'Api-Token': '5e8ddbdc78c1c6db3ae54a1b63fe7843c5141f8c' }
        }).then(res => {
        });
    }
}
export default new AdminService();