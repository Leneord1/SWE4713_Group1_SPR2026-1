import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { getAllUsers } from '../../services/adminService';
import { sendAdminEmail } from '../../services/emailService';
import { supabase } from '../../supabaseClient';
import './UserReport.css';

function UserReport({ hideHeader }) {
    const [selectedUser, setSelectedUser] = useState(null);
    const [emailSubject, setEmailSubject] = useState("");
    const [emailMessage, setEmailMessage] = useState("");
    const [sending, setSending] = useState(false);
    const [users, setUsers] = useState([])

    useEffect(() => {
        fetchUsers()

        const channel = supabase
            .channel('user-table-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'user' }, () => {
                fetchUsers()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    const fetchUsers = async () => {
        try {
            const data = await getAllUsers()
            setUsers(data)
        } catch (err) {
            console.error('Error fetching users:', err)
        }
    }

    const handleSendEmail = async () => {
        if (!emailSubject || !emailMessage) {
            alert("Subject and message required");
            return;
        }

        try {
            setSending(true);

            await sendAdminEmail(
            selectedUser.email,
            selectedUser.fName,
            emailSubject,
            emailMessage
            );

            alert("Email sent successfully");

            setEmailSubject("");
            setEmailMessage("");
            setSelectedUser(null);

        } catch (err) {
            console.error(err);
            alert("Failed to send email");
        } finally {
            setSending(false);
        }
    };

    return (
        <div>
            {!hideHeader && <h2>All Users</h2>}
            <table className="UserReport-table">
                <thead>
                    <tr>
                        <th className="UR-ID">ID</th>
                        <th className="UR-Username">Username</th>
                        <th className="UR-FirstName">First Name</th>
                        <th className="UR-LastName">Last Name</th>
                        <th className="UR-Email">Email</th>
                        <th className="UR-Role">Role</th>
                        <th className="UR-Status">Status</th>
                        <th className="UR-Actions">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => (
                        <tr key={user.userID}>
                            <td className="UR-ID">{user.userID}</td>
                            <td className="UR-Username">{user.username}</td>
                            <td className="UR-FirstName">{user.fName}</td>
                            <td className="UR-LastName">{user.lName}</td>
                            <td className="UR-Email">{user.email}</td>
                            <td className="UR-Role">{user.role}</td>
                            <td className="UR-Status">{user.status ? "Active" : "Inactive"}</td>
                            <td className="UR-Actions">
                                <button onClick={() => setSelectedUser(user)}>
                                    Email
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {selectedUser && (
                <div style={{ marginTop: "30px", padding: "20px", border: "1px solid var(--bff-primary)", borderRadius: "8px", backgroundColor: "#f9f9f9" }}>
                    <h3>Email {selectedUser.fName} ({selectedUser.email})</h3>

                    <input
                        type="text"
                        placeholder="Subject"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        style={{ width: "100%", marginBottom: "10px" }}
                        className="input"
                    />

                    <textarea
                    placeholder="Message"
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                    rows={6}
                    style={{ width: "100%", marginBottom: "10px" }}
                    className="input"
                    />

                    <button className="button-secondary" onClick={handleSendEmail} disabled={sending}>
                    {sending ? "Sending..." : "Send Email"}
                    </button>

                    <button className="button-primary" onClick={() => setSelectedUser(null)} style={{ marginLeft: "10px" }}>
                    Cancel
                    </button>
                </div>
            )}
        </div>
    );
}

UserReport.propTypes = {
    hideHeader: PropTypes.bool,
};

export default UserReport;
