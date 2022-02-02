import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Button, Divider, Input } from 'semantic-ui-react';
import Card from '../../components/Card';
import { MiscData, Show, Showtime } from '../../datatypes';
import { setData } from '../../reducers/dataReducer';
import database from '../../tools/database';
import { showMapper } from '../Homepage';

export default function AdminAddShow() {
  const dispatch = useDispatch();
  const [show, setShow] = useState(new Show());
  const card = showMapper([show], [new Showtime()], new MiscData())[0];

  const onSave = async () => {
    try {
      await database.shows.add(show);
    } catch {
      return;
    }
    
    dispatch(setData(await database.getPacket()));
    setShow(new Show());
  };
  
  return (
    <div className='ui container'>
      <h1>Add show</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <InputField label='Name' value={show.name} update={value => setShow({ ...show, name: value })} />
        <InputField label='Description' value={show.description} update={value => setShow({ ...show, description: value })} />
        <InputField label='Card description' value={show.shortDescription} update={value => setShow({ ...show, shortDescription: value })} />
        <InputField label='Image url' value={show.imageUrl} update={value => setShow({ ...show, imageUrl: value })} />
        <InputField label='Color' value={show.color} update={value => setShow({ ...show, color: value })} />
      </div>
      <Button onClick={onSave}>Save</Button>
      <Divider />
      <h2>Card preview</h2>
      <Card data={card} />
    </div>
  );
}

function InputField({ label, value, update }: { label: string, value: string | undefined, update: (value: string) => void; }) {
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    update(event.target.value);
  };

  return (
    <div>
      <label>{label}</label><br />
      <Input value={value ?? ''} onChange={onChange} style={{ margin: '0 10px 10px 0' }} />
    </div>
  );
}
