"use client";
import  { useEffect, useState } from 'react';
import Image from 'next/image';
import {  Bell, CreditCard, LifeBuoy, ChevronDown, Edit3, Loader2, User as UserIcon } from 'lucide-react';

export default function ProfileView() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('http://localhost:5000/api/auth/profile', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (res.ok) {
          setProfile(data);
        }
      } catch (error) {
        console.error("Profile fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading) return (
    <div className="flex h-96 items-center justify-center">
      <Loader2 className="animate-spin text-blue-600" size={40} />
    </div>
  );

  // Extracting data from your backend structure
  const user = profile?.user;
  const stats = profile?.additionalData?.yearlyReading?.[0] || { books_completed: 0 };

  return (
    <div className="max-w-4xl mx-auto p-6 animate-in fade-in duration-500">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-600 dark:text-white">Profile</h1>
        <p className="text-gray-500">Manage your account and reading preferences</p>
      </header>

      {/* --- Main Profile Card --- */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border dark:border-slate-700 overflow-hidden mb-6">
        {/* Banner */}
        <div className="h-32 bg-blue-600 relative"></div>
        
        <div className="px-8 pb-8">
          <div className="flex justify-between items-end -translate-y-6">
            <div className="flex items-end gap-4">
              {/* Avatar Fetching from Backend */}
              <div className="relative w-24 h-24 rounded-full border-4 border-white dark:border-slate-800 bg-gray-200 overflow-hidden shadow-md">
                {user?.avatar_url ? (
                  <Image src={user.avatar_url} alt="Profile" fill className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-400">
                    <UserIcon size={40} />
                  </div>
                )}
              </div>
              <div className="translate-y-2">
                <h2 className="text-2xl font-bold text-gray-600 dark:text-white">{user?.display_name || "User"}</h2>
                <p className="text-sm text-gray-500">{user?.email}</p>
              </div>
            </div>
            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm">
              <Edit3 size={16} /> Edit profile
            </button>
          </div>

          <hr className="my-6 dark:border-slate-700" />

          {/* Stats Section */}
          <div className="flex justify-around text-center">
            <div>
              <p className="text-xl font-bold text-gray-600 dark:text-white">219</p>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Followers</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-600 dark:text-white">382</p>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Following</p>
            </div>
            <div>
              {/* This stat comes from profile.additionalData.yearlyReading */}
              <p className="text-xl font-bold text-gray-600 dark:text-white">{stats.books_completed}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Books Read</p>
            </div>
          </div>
        </div>
      </div>

      {/* --- Favorite Genres --- */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border dark:border-slate-700 mb-6 shadow-sm">
        <h3 className="font-bold mb-4 text-gray-600 dark:text-white">Favorite Genres</h3>
        <div className="flex flex-wrap gap-2">
          {['Science Fiction', 'Fantasy', 'Mystery', 'Self-help'].map(genre => (
            <span key={genre} className="px-4 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full text-xs font-medium">
              {genre}
            </span>
          ))}
        </div>
      </div>

      {/* --- Account Settings --- */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
           <h3 className="font-bold text-sm dark:text-white">Account Settings</h3>
        </div>
        <div className="divide-y dark:divide-slate-700">
          <SettingsItem icon={<Bell size={18} />} label="Notifications" />
          <SettingsItem icon={<CreditCard size={18} />} label="Payment Methods" />
          <SettingsItem icon={<LifeBuoy size={18} />} label="Help & Support" />
        </div>
      </div>
    </div>
  );
}

// Sub-component for Settings List
function SettingsItem({ icon, label }: { icon: any, label: string }) {
  return (
    <div className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors group">
      <div className="flex items-center gap-4 text-gray-600 dark:text-gray-300">
        <span className="group-hover:text-blue-600 transition-colors">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <ChevronDown size={18} className="text-gray-400 -rotate-90" />
    </div>
  );
}