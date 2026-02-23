import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MemberPanel from './MemberPanel';

export default function DashboardLayout() {
    return (
        <div className="min-h-screen bg-background text-foreground flex">
            <Sidebar />
            <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
                <Topbar />
                <div className="flex-1 flex overflow-hidden">
                    <main className="flex-1 p-4 md:p-6 z-0 overflow-y-auto">
                        <Outlet />
                    </main>
                    <div className="hidden lg:block">
                        <MemberPanel />
                    </div>
                </div>
            </div>
        </div>
    );
}
