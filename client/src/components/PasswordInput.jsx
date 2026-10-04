import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function PasswordInput(props) {
  const [visible, setVisible] = useState(false);
  return <span className="passwordField">
    <input {...props} type={visible ? 'text' : 'password'} />
    <button type="button" className="passwordVisibility" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}
      onClick={() => setVisible(value => !value)}>
      {visible ? <EyeOff size={17} aria-hidden="true"/> : <Eye size={17} aria-hidden="true"/>}
    </button>
  </span>;
}
