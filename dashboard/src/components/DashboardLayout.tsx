import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MemberPanel from './MemberPanel';

export default function DashboardLayout() {
    const [membersVisible, setMembersVisible] = useState(() => {
        return localStorage.getItem('dashboard_members_panel') !== 'hidden';
    });

    useEffect(() => {
        localStorage.setItem('dashboard_members_panel', membersVisible ? 'visible' : 'hidden');
    }, [membersVisible]);

    return (
        <div className="dashboard-shell h-screen bg-background text-foreground flex overflow-hidden">
            <Sidebar />
            <div className="flex-1 md:ml-64 flex flex-col h-screen overflow-hidden">
                <Topbar
                    membersVisible={membersVisible}
                    onToggleMembers={() => setMembersVisible(v => !v)}
                />
                <div className="flex-1 flex overflow-hidden">
                    <main className="dashboard-main flex-1 p-4 md:p-6 z-0 overflow-y-auto custom-scrollbar">
                        <Outlet />
                    </main>
                    {membersVisible && (
                        <div className="hidden lg:block">
                            <MemberPanel onClose={() => setMembersVisible(false)} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
