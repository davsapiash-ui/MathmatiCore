import React, { useState, useRef, useCallback, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { Title, Card, Button, Flex } from '@tremor/react';

export default function AdminSchoolsView() {
  const gridRef = useRef();

  const [rowData, setRowData] = useState([
    { id: '1', name: 'בי"ס תל אביב', district: 'תל אביב', users: 1500, active: true },
    { id: '2', name: 'מחוז דרום', district: 'דרום', users: 8000, active: true },
    { id: '3', name: 'בי"ס חיפה', district: 'צפון', users: 450, active: true },
    { id: '4', name: 'בי"ס ירושלים', district: 'ירושלים', users: 1200, active: false },
  ]);

  const [colDefs, setColDefs] = useState([
    { field: "id", headerName: "מזהה מוסד", filter: true, editable: false, width: 120 },
    { field: "name", headerName: "שם המוסד", filter: true, editable: true },
    { field: "district", headerName: "מחוז", filter: true, editable: true },
    { field: "users", headerName: "מס' משתמשים", filter: 'agNumberColumnFilter', editable: true },
    { field: "active", headerName: "פעיל?", editable: true }
  ]);

  const defaultColDef = useMemo(() => ({
    flex: 1,
    minWidth: 150,
    filter: true,
    sortable: true,
    resizable: true,
  }), []);

  const onBtnExport = useCallback(() => {
    gridRef.current.api.exportDataAsCsv();
  }, []);

  return (
    <div className="p-6 bg-slate-50 w-full" dir="rtl">
      <Flex className="mb-6 justify-between items-center">
        <Title className="text-2xl font-bold text-slate-800">ניהול מוסדות חינוך (AG Grid)</Title>
        <Button onClick={onBtnExport} color="indigo" variant="secondary">ייצוא נתונים (CSV)</Button>
      </Flex>
      
      <Card className="h-[600px] p-0 overflow-hidden border-slate-200">
        <div className="ag-theme-quartz" style={{ height: '100%', width: '100%' }}>
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={colDefs}
            defaultColDef={defaultColDef}
            enableRtl={true}
            pagination={true}
            paginationPageSize={20}
            rowSelection="multiple"
          />
        </div>
      </Card>
    </div>
  );
}
