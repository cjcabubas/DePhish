import React from 'react';
import { AccountSecurity } from './AccountSecurity';

export function AccountSettings({ user, api }) {
  return <section className="accountSettings">
    <h1>Account settings</h1>
    <p>Manage your profile and sign-in security.</p>
    <section className="panel profileDetails" aria-labelledby="profile-heading">
      <h2 id="profile-heading">Profile</h2>
      <dl><div><dt>Name</dt><dd>{user.name}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div></dl>
    </section>
    <AccountSecurity api={api}/>
  </section>;
}
