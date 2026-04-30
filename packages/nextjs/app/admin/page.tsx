"use client";

import dynamic from "next/dynamic";
import type { NextPage } from "next";

const AdminPanel = dynamic(() => import("~~/components/larvae/AdminPanel").then(m => m.AdminPanel), { ssr: false });

const AdminRoute: NextPage = () => <AdminPanel />;

export default AdminRoute;
